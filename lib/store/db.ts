import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";

/**
 * The store — libSQL (SQLite-compatible). ONE client, two homes:
 *
 *   • local dev  → a local file (`file:data/tastebud.db`), same on-disk DB as before, so nothing
 *                  changes for you locally and the existing data/brains folders still seed in.
 *   • serverless → a hosted Turso database over HTTP when TURSO_DATABASE_URL is set — because
 *                  Vercel's filesystem is READ-ONLY + ephemeral, so a file-backed SQLite there
 *                  can't persist a single write. The SQL is identical; only the connection moves.
 *
 * The client is async (a network call on Turso), so every store function awaits its queries.
 * Cross-statement atomicity is relaxed vs. the old synchronous node:sqlite store (there is one
 * writer per brand in practice), but each individual write is still atomic, and pure-write
 * sequences use `batch()` which Turso commits all-or-nothing.
 *
 * Everything sits behind this module + the store/*.ts API, so the call sites never move.
 */

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = process.env.STORE_DB_PATH || join(DATA_DIR, "tastebud.db");

/** Single tenant bucket until real accounts land. UNIQUE(account_id, slug) then lets two
 *  different customers both own a brand called "Nira" without colliding. */
export const DEFAULT_ACCOUNT = "default";

export function nowISO(): string {
  return new Date().toISOString();
}

/** Stable, collision-resistant id — decouples a brand's identity from its (mutable) name. */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Hosted Turso (or any libSQL URL) when configured; else the local file for dev. */
function connectionConfig(): { url: string; authToken?: string } {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || `file:${DB_PATH}`;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || undefined;
  return { url, authToken };
}

/** True when pointed at a remote libSQL/Turso DB (vs. the local file) — gates local-only seeding. */
function isRemote(): boolean {
  return !!(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS _seed (key TEXT PRIMARY KEY, done_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT,
  name       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  brain_json      TEXT NOT NULL,
  guidelines_json TEXT,
  origin          TEXT,
  email           TEXT,
  has_research    INTEGER NOT NULL DEFAULT 0,
  has_guidelines  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (account_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands (account_id, slug);
CREATE INDEX IF NOT EXISTS idx_brands_updated ON brands (updated_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id         TEXT PRIMARY KEY,
  brand_id   TEXT NOT NULL,
  data_json  TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns (brand_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_memory (
  id         TEXT PRIMARY KEY,
  brand_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  content    TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agentmem_brand ON agent_memory (brand_id, kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  brand_id   TEXT NOT NULL,
  mode       TEXT,
  title      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_brand ON conversations (brand_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  brand_id        TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  delta         INTEGER NOT NULL,
  reason        TEXT,
  balance_after INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON credit_ledger (account_id, created_at DESC);
`;

export type Row = Record<string, unknown>;

type WithClient = typeof globalThis & { __tastebudClient?: Client; __tastebudReady?: Promise<Client> };
const g = globalThis as WithClient;

async function init(client: Client): Promise<void> {
  // Best-effort pragmas — a no-op / rejected on remote Turso, which is fine.
  for (const p of ["PRAGMA journal_mode = WAL", "PRAGMA foreign_keys = ON", "PRAGMA busy_timeout = 5000"]) {
    try { await client.execute(p); } catch { /* remote may reject; ignore */ }
  }
  await client.executeMultiple(SCHEMA);
  await client.execute({ sql: "INSERT OR IGNORE INTO accounts (id, name, created_at) VALUES (?, ?, ?)", args: [DEFAULT_ACCOUNT, "Default", nowISO()] });
  await seedFromFilesystem(client);
}

/**
 * The process-wide libSQL client, cached on globalThis so Next's dev HMR reuses one handle and
 * the schema init runs exactly once (a shared in-flight promise dedupes concurrent first calls).
 */
export function getClient(): Promise<Client> {
  if (g.__tastebudClient) return Promise.resolve(g.__tastebudClient);
  if (!g.__tastebudReady) {
    const { url, authToken } = connectionConfig();
    const client = createClient({ url, authToken });
    g.__tastebudReady = init(client)
      .then(() => { g.__tastebudClient = client; return client; })
      .catch((e) => { g.__tastebudReady = undefined; throw e; }); // let a failed init retry next call
  }
  return g.__tastebudReady;
}

// ── Query helpers ────────────────────────────────────────────────────────────

/** All rows for a query. */
export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const client = await getClient();
  const r = await client.execute({ sql, args });
  return r.rows as unknown as T[];
}

/** The first row, or undefined. */
export async function one<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** A single write. */
export async function run(sql: string, args: InArgs = []): Promise<void> {
  const client = await getClient();
  await client.execute({ sql, args });
}

/** A batch of writes, committed all-or-nothing (the atomic replacement for the old `tx()`). */
export async function batch(stmts: InStatement[]): Promise<void> {
  if (!stmts.length) return;
  const client = await getClient();
  await client.batch(stmts, "write");
}

/** Resolve a brand's stable id from its slug within an account (null if none). */
export async function brandIdBySlug(slug: string, account = DEFAULT_ACCOUNT): Promise<string | null> {
  const row = await one<{ id: string }>("SELECT id FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  return row?.id ?? null;
}

/**
 * One-time, IDEMPOTENT migration: read every data/brains/<slug>/ folder into the DB. Runs ONLY
 * against the local file DB — a remote Turso DB starts fresh (seeding it from bundled files on
 * every serverless cold start would be wrong). Reads the filesystem only; never writes back.
 * Guarded by a _seed marker so it runs once; delete that row to re-import.
 */
async function seedFromFilesystem(client: Client): Promise<void> {
  if (isRemote()) return;
  try {
    // Use the passed client DIRECTLY, never the public one()/all()/run() helpers — those await
    // getClient(), which is still mid-init here, so routing seed queries through them deadlocks.
    const already = await client.execute({ sql: "SELECT key FROM _seed WHERE key = ?", args: ["fs-brains-v1"] });
    if (already.rows.length) return;

    const brainsDir = join(DATA_DIR, "brains");
    const readJson = <T>(p: string): T | null => {
      try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return null; }
    };

    const stmts: InStatement[] = [];
    let slugs: string[] = [];
    try { slugs = existsSync(brainsDir) ? readdirSync(brainsDir) : []; } catch { slugs = []; }
    for (const slug of slugs) {
      const d = join(brainsDir, slug);
      try { if (!statSync(d).isDirectory()) continue; } catch { continue; }
      const brain = readJson<Record<string, unknown>>(join(d, "brain.json"));
      if (!brain) continue;
      const meta = readJson<Record<string, unknown>>(join(d, "meta.json")) ?? {};
      const guidelines = readJson<unknown>(join(d, "guidelines.json"));
      const ts = (meta.updatedAt as string) || (meta.createdAt as string) || nowISO();
      const brandId = genId("brd"); // we generate it, so we can wire campaign FKs without a lookup

      stmts.push({
        sql: `INSERT OR IGNORE INTO brands (id, account_id, slug, name, brain_json, guidelines_json, origin, email, has_research, has_guidelines, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          brandId, DEFAULT_ACCOUNT, slug,
          (brain.name as string) || (meta.name as string) || slug,
          JSON.stringify(brain),
          guidelines != null ? JSON.stringify(guidelines) : null,
          (meta.origin as string) || "studio",
          (meta.email as string) || null,
          brain.research ? 1 : 0,
          meta.hasGuidelines ? 1 : 0,
          (meta.createdAt as string) || ts,
          ts,
        ],
      });

      const campaigns = readJson<Record<string, unknown>[]>(join(d, "campaigns.json")) ?? [];
      for (const c of campaigns) {
        if (!c || !c.id) continue;
        stmts.push({ sql: "INSERT OR IGNORE INTO campaigns (id, brand_id, data_json, updated_at) VALUES (?, ?, ?, ?)", args: [String(c.id), brandId, JSON.stringify(c), (c.updatedAt as string) || ts] });
      }
    }
    stmts.push({ sql: "INSERT OR IGNORE INTO _seed (key, done_at) VALUES (?, ?)", args: ["fs-brains-v1", nowISO()] });
    if (stmts.length) await client.batch(stmts, "write");
  } catch {
    /* a bad folder must never take down the store */
  }
}
