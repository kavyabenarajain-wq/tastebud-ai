// One-time backfill: reassign brands owned by the pre-auth 'default' account to a real account.
// The 38 brands were created before Google sign-in existed, so they all sit under 'default';
// this assigns them to their real owner so they show up per-user in the customer_overview CRM view.
//
// Usage:  node scripts/backfill-brand-owner.mjs <owner-email>
// Safe:   only moves rows FROM 'default'; UNIQUE(account_id, slug) protects against collisions
//         (aborts the whole UPDATE if the target already owns a same-slug brand).
import pg from "pg";

const OWNER = (process.argv[2] || "").trim().toLowerCase();
const PG_URL = process.env.DATABASE_URL;
if (!OWNER || !OWNER.includes("@")) { console.error("Usage: node scripts/backfill-brand-owner.mjs <owner-email>"); process.exit(1); }
if (!PG_URL) { console.error("DATABASE_URL unset"); process.exit(1); }

const pool = new pg.Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false }, max: 2 });

async function main() {
  const owner = (await pool.query("SELECT id FROM accounts WHERE id = $1", [OWNER])).rows[0];
  if (!owner) { console.error(`Account ${OWNER} does not exist — sign in first.`); process.exit(2); }

  const before = (await pool.query("SELECT COUNT(*)::int n FROM brands WHERE account_id = 'default'")).rows[0].n;
  console.log(`brands under 'default' before: ${before}`);

  const r = await pool.query("UPDATE brands SET account_id = $1 WHERE account_id = 'default'", [OWNER]);
  console.log(`reassigned ${r.rowCount} brands -> ${OWNER}`);

  await pool.query(
    "INSERT INTO events (id, account_id, type, detail, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [`evt_backfill_${Date.now().toString(36)}`, OWNER, "brands_backfilled", `${r.rowCount} brands assigned from default`, new Date().toISOString()],
  );

  const ov = (await pool.query("SELECT name, provider, plan, brand_count, meals_bought, meal_balance FROM customer_overview WHERE account = $1", [OWNER])).rows[0];
  const stillDefault = (await pool.query("SELECT COUNT(*)::int n FROM brands WHERE account_id = 'default'")).rows[0].n;
  console.log("customer_overview now:", JSON.stringify(ov));
  console.log("brands still under 'default':", stillDefault);

  await pool.end();
}
main().catch((e) => { console.error("BACKFILL FAILED:", e.message); process.exit(1); });
