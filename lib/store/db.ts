import { Pool, type PoolClient } from "pg";

/**
 * The store — Supabase Postgres (migrated off libSQL/Turso, Jul 2026). ONE pg Pool, cached on
 * globalThis so Next's dev HMR reuses one handle and the schema init runs exactly once.
 *
 * The store modules were NOT rewritten: they still hand us SQLite-style SQL — `?` placeholders and
 * `INSERT OR IGNORE`. A small dialect shim (`toPg`) rewrites those to Postgres (`$1/$2…` and
 * `ON CONFLICT DO NOTHING`) at execution time, so every existing query string stayed put. The rest
 * of the SQL in this app (TEXT/INTEGER/REAL columns, ISO-string timestamps, foreign keys, LIKE over
 * lowercase prefixes, COALESCE/SUM) is already valid Postgres.
 *
 * Connection: DATABASE_URL must be a Supabase POOLER url (…pooler.supabase.com) — the direct
 * db.<ref>.supabase.co host is IPv6-only and unreachable from most networks and from Vercel.
 */

/** Single tenant bucket until every row is account-scoped. UNIQUE(account_id, slug) lets two
 *  customers each own a brand called "Nira" without colliding. */
export const DEFAULT_ACCOUNT = "default";

export function nowISO(): string {
  return new Date().toISOString();
}

/** Stable, collision-resistant id — decouples a row's identity from its (mutable) name. */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

export type Row = Record<string, unknown>;
export type SqlArg = string | number | boolean | null | undefined;
export type InArgs = SqlArg[];
export type InStatement = { sql: string; args?: InArgs };

// ── Dialect shim: SQLite SQL → Postgres ──────────────────────────────────────
/**
 * Rewrite one statement:
 *   • `?` positional placeholders → `$1, $2, …`  (quote-aware: a `?` inside a '…' or "…" literal
 *     is left untouched — this codebase has none today, but the guard keeps it correct forever)
 *   • `INSERT OR IGNORE INTO …` → `INSERT INTO … ON CONFLICT DO NOTHING`
 */
export function toPg(sql: string): string {
  let out = "";
  let n = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "?" && !inSingle && !inDouble) {
      out += "$" + ++n;
      continue;
    }
    out += ch;
  }
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(out)) {
    out = out.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "$1INSERT INTO ");
    if (!/ON\s+CONFLICT/i.test(out)) out = out.replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
  }
  return out;
}

/** pg rejects `undefined` params; map them (and nothing else) to NULL. */
function cleanArgs(args: InArgs): unknown[] {
  return args.map((a) => (a === undefined ? null : a));
}

// ── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE IF NOT EXISTS _seed (key TEXT PRIMARY KEY, done_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT,
  name       TEXT,
  plan       TEXT NOT NULL DEFAULT 'free',
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

-- Append-only audit of every verified payment (the visible money trail). The credit_ledger stays
-- the source of truth for BALANCES; this records WHAT was paid, by WHOM, WHEN — one row per Dodo
-- payment/subscription event, id = the Dodo payment_id (idempotent via the PK).
CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  buyable    TEXT,
  plan       TEXT,
  meals      INTEGER NOT NULL DEFAULT 0,
  amount_usd REAL,
  status     TEXT NOT NULL,
  event_type TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments (account_id, created_at DESC);
`;

// ── Pool lifecycle ───────────────────────────────────────────────────────────
type G = typeof globalThis & { __pgPool?: Pool; __pgReady?: Promise<Pool> };
const g = globalThis as G;

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is unset — the Postgres store can't connect.");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Supabase serves TLS; the pooler's chain isn't in Node's default store
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on("error", (e) => console.error("[store] pg pool error:", e.message));
  return pool;
}

async function initSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA); // multi-statement DDL (no params) runs via the simple query protocol
  // Idempotent guard for DBs created before `plan` existed (Postgres supports IF NOT EXISTS).
  await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'");
  await pool.query("INSERT INTO accounts (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [DEFAULT_ACCOUNT, "Default", nowISO()]);
}

/** The process-wide pool; schema init runs exactly once (a shared in-flight promise dedupes first calls). */
export function getPool(): Promise<Pool> {
  if (g.__pgPool) return Promise.resolve(g.__pgPool);
  if (!g.__pgReady) {
    const pool = makePool();
    let host = "?";
    try { host = new URL(process.env.DATABASE_URL as string).host; } catch { /* keep ? */ }
    console.log(`[store] Postgres → ${host}`);
    g.__pgReady = initSchema(pool)
      .then(() => { g.__pgPool = pool; return pool; })
      .catch((e) => { g.__pgReady = undefined; throw e; }); // let a failed init retry next call
  }
  return g.__pgReady;
}

/** Back-compat alias — a couple of call sites import getClient(). */
export const getClient = getPool;

// ── Query helpers (same signatures the store modules already call) ────────────
/** All rows for a query. */
export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const pool = await getPool();
  const r = await pool.query(toPg(sql), cleanArgs(args));
  return r.rows as unknown as T[];
}

/** The first row, or undefined. */
export async function one<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** A single write. */
export async function run(sql: string, args: InArgs = []): Promise<void> {
  const pool = await getPool();
  await pool.query(toPg(sql), cleanArgs(args));
}

/** A batch of writes, committed all-or-nothing (transaction on one pooled connection). */
export async function batch(stmts: InStatement[]): Promise<void> {
  if (!stmts.length) return;
  const pool = await getPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of stmts) await client.query(toPg(s.sql), cleanArgs(s.args ?? []));
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connection already broken */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Resolve a brand's stable id from its slug within an account (null if none). */
export async function brandIdBySlug(slug: string, account = DEFAULT_ACCOUNT): Promise<string | null> {
  const row = await one<{ id: string }>("SELECT id FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  return row?.id ?? null;
}
