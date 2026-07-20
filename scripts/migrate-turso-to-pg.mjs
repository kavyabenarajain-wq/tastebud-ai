// One-time migration: libSQL/Turso file (data/tastebud.db) → Supabase Postgres (DATABASE_URL).
// Non-destructive: the Turso file is only READ. Idempotent: every insert is ON CONFLICT DO NOTHING,
// so re-running can't duplicate. Run:  node scripts/migrate-turso-to-pg.mjs   (with .env sourced)
import { createClient } from "@libsql/client";
import pg from "pg";

const TURSO_URL = process.env.TURSO_URL || `file:${process.cwd()}/data/tastebud.db`;
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) { console.error("DATABASE_URL is unset"); process.exit(1); }

// Mirrors lib/store/db.ts SCHEMA (kept in sync by hand — this is a one-shot script).
const DDL = `
CREATE TABLE IF NOT EXISTS _seed (key TEXT PRIMARY KEY, done_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT, name TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, brain_json TEXT NOT NULL, guidelines_json TEXT, origin TEXT, email TEXT, has_research INTEGER NOT NULL DEFAULT 0, has_guidelines INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (account_id, slug));
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands (account_id, slug);
CREATE INDEX IF NOT EXISTS idx_brands_updated ON brands (updated_at DESC);
CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns (brand_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS agent_memory (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_agentmem_brand ON agent_memory (brand_id, kind, updated_at DESC);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, mode TEXT, title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_conv_brand ON conversations (brand_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, brand_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT, balance_after INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON credit_ledger (account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, buyable TEXT, plan TEXT, meals INTEGER NOT NULL DEFAULT 0, amount_usd REAL, status TEXT NOT NULL, event_type TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments (account_id, created_at DESC);
`;

// FK-safe order: parents before children.
const TABLES = ["_seed", "accounts", "brands", "conversations", "campaigns", "agent_memory", "messages", "credit_ledger"];

const coerce = (v) => (typeof v === "bigint" ? Number(v) : v);

const turso = createClient({ url: TURSO_URL });
const pool = new pg.Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false }, max: 4 });

async function main() {
  console.log("Turso :", TURSO_URL);
  console.log("PG    :", new URL(PG_URL).host, "\n");

  // 1) schema
  await pool.query(DDL);
  console.log("schema ensured on Postgres\n");

  // 2) copy each table
  const report = [];
  for (const t of TABLES) {
    let src;
    try { src = await turso.execute(`SELECT * FROM ${t}`); }
    catch { report.push([t, "—", "—", "missing in Turso"]); continue; }
    const cols = src.columns;
    let inserted = 0;
    for (const row of src.rows) {
      const vals = cols.map((c) => coerce(row[c]));
      const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
      const quoted = cols.map((c) => `"${c}"`).join(", ");
      const res = await pool.query(`INSERT INTO ${t} (${quoted}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
      inserted += res.rowCount ?? 0;
    }
    const pgCount = (await pool.query(`SELECT COUNT(*)::int n FROM ${t}`)).rows[0].n;
    report.push([t, src.rows.length, pgCount, inserted === src.rows.length ? "ok" : `inserted ${inserted}`]);
  }

  console.log("TABLE            turso   pg   note");
  for (const [t, s, p, note] of report) console.log(t.padEnd(15), String(s).padStart(5), String(p).padStart(4), " ", note);

  // 3) verify balances match per account (the number that actually matters)
  console.log("\nBALANCE CHECK (SUM(delta) per account):");
  const tBal = new Map((await turso.execute("SELECT account_id, COALESCE(SUM(delta),0) b FROM credit_ledger GROUP BY account_id")).rows.map((r) => [r.account_id, Number(r.b)]));
  const pBal = new Map((await pool.query("SELECT account_id, COALESCE(SUM(delta),0)::int b FROM credit_ledger GROUP BY account_id")).rows.map((r) => [r.account_id, Number(r.b)]));
  let mismatch = 0;
  const accounts = new Set([...tBal.keys(), ...pBal.keys()]);
  for (const a of accounts) {
    const t = tBal.get(a) ?? 0, p = pBal.get(a) ?? 0;
    const ok = t === p;
    if (!ok) mismatch++;
    console.log(`  ${ok ? "✓" : "✗"} ${a}: turso ${t}  pg ${p}`);
  }
  console.log(mismatch === 0 ? "\nALL BALANCES MATCH ✅" : `\n${mismatch} BALANCE MISMATCH(ES) ❌`);

  await pool.end();
  process.exit(mismatch === 0 ? 0 : 2);
}

main().catch((e) => { console.error("MIGRATION FAILED:", e.message); process.exit(1); });
