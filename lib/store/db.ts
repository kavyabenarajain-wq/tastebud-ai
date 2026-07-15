import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";

/**
 * The store — SQLite (Node's built-in node:sqlite), one file at data/tastebud.db.
 *
 * Why SQLite: `node:sqlite` is SYNCHRONOUS, so SQLite serialises every write and a
 * transaction is truly atomic. That kills the read-modify-write races the old
 * filesystem JSON store had (two actions on one brand could silently clobber each
 * other — hence "the live brain has no backup, never test writes against it"). It is
 * also multi-tenant by construction: every row is scoped to a brand, and every brand
 * to an account, so different brands run simultaneously without touching each other.
 *
 * Everything sits behind this module + the store/*.ts API, so swapping to Postgres
 * later (when auth + Stripe credits arrive) is a contained change — call sites don't move.
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
  brain_json      TEXT NOT NULL,           -- the whole BrandBrain blob (incl. its learned memory)
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
  data_json  TEXT NOT NULL,                -- the Campaign blob (name, type, copy, outputs)
  updated_at TEXT NOT NULL,
  FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns (brand_id, updated_at DESC);

-- Agent memory: what the director LEARNS about a brand and carries between sessions.
CREATE TABLE IF NOT EXISTS agent_memory (
  id         TEXT PRIMARY KEY,
  brand_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,                -- 'preference' | 'fact' | 'summary'
  content    TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agentmem_brand ON agent_memory (brand_id, kind, updated_at DESC);

-- Conversations + messages: the persistent chat thread per brand, so the agent has continuity.
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
  role            TEXT NOT NULL,           -- 'user' | 'assistant'
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages (conversation_id, created_at);

-- Credits ledger: designed now, enforced later (payments). Append-only; balance = running total.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  delta         INTEGER NOT NULL,          -- +topup / -spend
  reason        TEXT,
  balance_after INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON credit_ledger (account_id, created_at DESC);
`;

type WithDb = typeof globalThis & { __tastebudDb?: DatabaseSync };
const g = globalThis as WithDb;

/** The process-wide connection. Cached on globalThis so Next's dev HMR reuses one handle. */
export function getDb(): DatabaseSync {
  if (g.__tastebudDb) return g.__tastebudDb;
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  ensureAccount(db, DEFAULT_ACCOUNT);
  g.__tastebudDb = db;
  seedFromFilesystem(db); // one-time migration of the existing data/brains/* folders
  return db;
}

function ensureAccount(db: DatabaseSync, id: string): void {
  db.prepare("INSERT OR IGNORE INTO accounts (id, name, created_at) VALUES (?, ?, ?)").run(id, "Default", nowISO());
}

/**
 * Run `fn` inside a transaction (node:sqlite has no `.transaction()` helper, unlike
 * better-sqlite3, so we drive BEGIN/COMMIT/ROLLBACK by hand). This is what makes
 * read-modify-write on a brand atomic — concurrent actions can't interleave and clobber.
 * Non-nesting: never call tx() from inside another tx() (SQLite rejects a nested BEGIN).
 */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  }
}

/** Resolve a brand's stable id from its slug within an account (null if none). */
export function brandIdBySlug(db: DatabaseSync, slug: string, account = DEFAULT_ACCOUNT): string | null {
  const row = db.prepare("SELECT id FROM brands WHERE account_id = ? AND slug = ?").get(account, slug) as unknown as { id?: string } | undefined;
  return row?.id ?? null;
}

/**
 * One-time, IDEMPOTENT migration: read every data/brains/<slug>/ folder and copy it into
 * SQLite. Reads the filesystem ONLY — it never writes back, so the existing brand folders
 * (which have no backup) are left exactly as they are. Guarded by a _seed marker so it
 * runs once; delete the marker row to re-import.
 */
function seedFromFilesystem(db: DatabaseSync): void {
  const already = db.prepare("SELECT key FROM _seed WHERE key = ?").get("fs-brains-v1");
  if (already) return;

  const brainsDir = join(DATA_DIR, "brains");
  const readJson = <T>(p: string): T | null => {
    try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return null; }
  };

  const insertBrand = db.prepare(
    `INSERT OR IGNORE INTO brands (id, account_id, slug, name, brain_json, guidelines_json, origin, email, has_research, has_guidelines, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertCampaign = db.prepare(
    `INSERT OR IGNORE INTO campaigns (id, brand_id, data_json, updated_at) VALUES (?, ?, ?, ?)`
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    let slugs: string[] = [];
    try { slugs = existsSync(brainsDir) ? readdirSync(brainsDir) : []; } catch { slugs = []; }
    for (const slug of slugs) {
      const d = join(brainsDir, slug);
      try { if (!statSync(d).isDirectory()) continue; } catch { continue; }

      const brain = readJson<Record<string, unknown>>(join(d, "brain.json"));
      if (!brain) continue; // a folder with no brain.json isn't a real brand
      const meta = readJson<Record<string, unknown>>(join(d, "meta.json")) ?? {};
      const guidelines = readJson<unknown>(join(d, "guidelines.json"));
      const ts = (meta.updatedAt as string) || (meta.createdAt as string) || nowISO();

      const id = genId("brd");
      insertBrand.run(
        id,
        DEFAULT_ACCOUNT,
        slug,
        (brain.name as string) || (meta.name as string) || slug,
        JSON.stringify(brain),
        guidelines != null ? JSON.stringify(guidelines) : null,
        (meta.origin as string) || "studio",
        (meta.email as string) || null,
        brain.research ? 1 : 0,
        (meta.hasGuidelines ? 1 : 0),
        (meta.createdAt as string) || ts,
        ts,
      );
      const brandId = brandIdBySlug(db, slug); // the row we just wrote (or a pre-existing one)
      if (!brandId) continue;

      const campaigns = readJson<Record<string, unknown>[]>(join(d, "campaigns.json")) ?? [];
      for (const c of campaigns) {
        if (!c || !c.id) continue;
        insertCampaign.run(String(c.id), brandId, JSON.stringify(c), (c.updatedAt as string) || ts);
      }
    }
    db.prepare("INSERT INTO _seed (key, done_at) VALUES (?, ?)").run("fs-brains-v1", nowISO());
    db.exec("COMMIT");
  } catch {
    // a bad folder must never take down the store — roll back and run on an (empty) DB
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
  }
}
