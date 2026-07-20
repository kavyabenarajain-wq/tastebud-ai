import { one, run, nowISO, genId, DEFAULT_ACCOUNT } from "./db";
import { FREE_TRIAL_IMAGES, FREE_TRIAL_DAYS, PLANS, MEAL_COSTS, type PlanId } from "../meals";

/**
 * Meals — the usage ledger (né credits). 1 Meal = 1 delivered image.
 *
 * An append-only ledger per account. Balance is SUM(delta) — order-independent, so interleaved
 * writes from two tabs / two serverless instances can never corrupt it (balance_after stays on
 * each row as an informational snapshot only). Grants use DETERMINISTIC primary keys with
 * INSERT OR IGNORE, so the free-trial grant and monthly plan grant are double-grant-proof at the
 * DB level with no cron and no SELECT-then-INSERT race.
 *
 * OBSERVE MODE (CREDITS_ENFORCED unset/0 — the default): every charge/refund/grant WRITES its
 * ledger row so real usage accumulates from day one, but nothing ever refuses — balances may go
 * negative and the UI clamps display at 0. Flipping CREDITS_ENFORCED=1 changes exactly one
 * behaviour: charges refuse (or partially grant) when the balance is short. Stripe lands on
 * `topUp()`; real auth lands by threading a real account id instead of DEFAULT_ACCOUNT.
 */

const ENFORCED = process.env.CREDITS_ENFORCED === "1";

// Owner accounts are UNCAPPED — the Meals cap never applies to them. Everyone else (free accounts)
// is held to their balance (the one-time trial when unpaid — see FREE_TRIAL_IMAGES). Set
// MEALS_OWNER_EMAIL to a comma-separated allowlist of owner emails; matched case-insensitively.
const OWNERS = new Set(
  (process.env.MEALS_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const isOwner = (account: string): boolean => OWNERS.has(account.trim().toLowerCase());

/** True when Meals enforcement applies to THIS account (enforced globally, minus owner exemption). */
function enforcedFor(account: string): boolean {
  return ENFORCED && !isOwner(account);
}

export function creditsEnforced(): boolean {
  return ENFORCED;
}

/** Server-side trial overrides (ops toggles); fall back to the published constants. */
function trialImages(): number {
  const n = Number(process.env.MEALS_FREE_TRIAL_IMAGES);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : FREE_TRIAL_IMAGES;
}
function trialDays(): number {
  const n = Number(process.env.MEALS_FREE_TRIAL_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : FREE_TRIAL_DAYS;
}
const DAY_MS = 86_400_000;
/** Milliseconds a free account still has left in its trial window (≤0 once closed). */
function trialMsLeft(createdAt?: string): number {
  const start = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(start) ? start + trialDays() * DAY_MS - Date.now() : 0;
}

/** UTC day stamp — deterministic across serverless regions. */
const utcDay = (d = new Date()): string => d.toISOString().slice(0, 10);
const utcMonth = (d = new Date()): string => d.toISOString().slice(0, 7);

async function currentBalance(account: string): Promise<number> {
  const row = await one<{ bal: number }>("SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_ledger WHERE account_id = ?", [account]);
  return Number(row?.bal ?? 0);
}

export async function getBalance(account = DEFAULT_ACCOUNT): Promise<number> {
  return currentBalance(account);
}

/** Insert one ledger row. A deterministic id + OR IGNORE makes the insert idempotent (grants). */
async function insertLedger(account: string, delta: number, reason: string, id?: string): Promise<void> {
  const bal = (await currentBalance(account)) + delta; // best-effort snapshot; SUM is the truth
  await run(
    `INSERT ${id ? "OR IGNORE " : ""}INTO credit_ledger (id, account_id, delta, reason, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id ?? genId("led"), account, delta, reason, bal, nowISO()],
  );
}

/**
 * Add Meals (a Dodo purchase, a grant, a promo). Returns the new balance.
 * Pass a deterministic `id` (e.g. `led_dodo_<payment_id>`) to make the grant idempotent —
 * webhook re-deliveries then INSERT OR IGNORE instead of double-granting.
 */
export async function topUp(account: string, amount: number, reason = "top-up", id?: string): Promise<number> {
  await insertLedger(account, amount, reason, id);
  return currentBalance(account);
}

/** Return Meals for undelivered work. Kept distinct from topUp so netSpendOn can net it out. */
export async function refund(account: string, amount: number, reason: string): Promise<void> {
  if (amount <= 0) return;
  await insertLedger(account, amount, reason.startsWith("refund:") ? reason : `refund:${reason}`);
}

/**
 * Spend Meals for a single action. Observe mode: writes the debit and always succeeds. Enforced:
 * refuses (writes nothing) when the balance is short. Single-action routes (upscale/enhance) use
 * this; the generate route uses chargeUpTo for partial grants.
 */
export async function charge(account: string, amount: number, reason: string): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) return { ok: true, balance: await currentBalance(account) };
  if (enforcedFor(account)) {
    const cur = await currentBalance(account);
    if (cur < amount) return { ok: false, balance: cur };
  }
  await insertLedger(account, -amount, reason);
  return { ok: true, balance: await currentBalance(account) };
}

/**
 * Spend up to `want` Meals — the generate-route primitive. Enforced: grants min(want, balance)
 * so a short balance CLAMPS the shoot instead of failing it (mirrors the imageBudget clamp).
 * Observe mode: grants everything, writing the true debit. One ledger write per run — never
 * called from concurrent render workers.
 */
export async function chargeUpTo(account: string, want: number, reason: string): Promise<{ granted: number; balance: number }> {
  if (want <= 0) return { granted: 0, balance: await currentBalance(account) };
  const cur = await currentBalance(account);
  const granted = enforcedFor(account) ? Math.max(0, Math.min(want, cur)) : want;
  if (granted > 0) await insertLedger(account, -granted, reason);
  return { granted, balance: await currentBalance(account) };
}

/** Net Meals spent on a UTC day: debits minus refunds, grants/expiries excluded. */
export async function netSpendOn(account: string, day: string): Promise<number> {
  const row = await one<{ spent: number }>(
    `SELECT COALESCE(SUM(CASE
        WHEN delta < 0 AND reason NOT LIKE 'drip-expire:%' THEN -delta
        WHEN delta > 0 AND reason LIKE 'refund:%' THEN -delta
        ELSE 0 END), 0) AS spent
     FROM credit_ledger WHERE account_id = ? AND created_at >= ? AND created_at < ?`,
    [account, `${day}T00:00:00`, `${day}T23:59:59.999Z`],
  );
  return Math.max(0, Number(row?.spent ?? 0));
}

/** Net Meals spent by an account since an ISO instant (debits minus refunds; expiries excluded). */
async function netSpendSince(account: string, sinceISO: string): Promise<number> {
  const row = await one<{ spent: number }>(
    `SELECT COALESCE(SUM(CASE
        WHEN delta < 0 AND reason NOT LIKE '%expire%' THEN -delta
        WHEN delta > 0 AND reason LIKE 'refund:%' THEN -delta
        ELSE 0 END), 0) AS spent
     FROM credit_ledger WHERE account_id = ? AND created_at >= ?`,
    [account, sinceISO],
  );
  return Math.max(0, Number(row?.spent ?? 0));
}

/**
 * The free trial, reconciled idempotently (deterministic PKs → INSERT OR IGNORE):
 *   • Free plan, inside the first FREE_TRIAL_DAYS: grant FREE_TRIAL_IMAGES Meals ONCE.
 *   • Free plan, window closed: expire whatever of that grant is still unspent, ONCE.
 *   • Paid plan: no-op — Starter / Chef's Table / Banquet live on their monthly Meals alone.
 * Grant and expire are both PK-guarded, so this is safe to run on every metered request.
 */
const trialReconciled = new Map<string, string>(); // account → day last reconciled in this process
export async function ensureTrialGrant(account = DEFAULT_ACCOUNT): Promise<void> {
  const today = utcDay();
  if (trialReconciled.get(account) === today) return; // memo: skip repeat work within a process-day
  if ((await getPlan(account)) !== "free") { trialReconciled.set(account, today); return; } // paid → no trial

  await ensureAccount(account); // guarantee a created_at row to anchor the trial window to
  const acct = await one<{ created_at: string }>("SELECT created_at FROM accounts WHERE id = ?", [account]);
  if (!acct?.created_at) return;

  if (trialMsLeft(acct.created_at) > 0) {
    const grant = trialImages();
    if (grant > 0) await insertLedger(account, grant, "trial", `led_trial_${account}`);
  } else {
    // Window closed — remove the unspent remainder of the trial grant, exactly once. `unused` nets
    // out spend since signup so a mid-trial top-up (rare) is never wrongly clawed back, and it is
    // clamped to the live balance so the expiry can never drive it negative.
    const grant = await one<{ delta: number }>("SELECT delta FROM credit_ledger WHERE id = ?", [`led_trial_${account}`]);
    const done = await one<{ id: string }>("SELECT id FROM credit_ledger WHERE id = ?", [`led_trialexp_${account}`]);
    if (grant && !done) {
      const spent = await netSpendSince(account, acct.created_at);
      const unused = Math.min(Math.max(0, Number(grant.delta) - spent), Math.max(0, await currentBalance(account)));
      if (unused > 0) await insertLedger(account, -unused, "trial-expire", `led_trialexp_${account}`);
    }
  }
  trialReconciled.set(account, today);
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Normalize a client-supplied account id (an email) into a ledger key, or null when it isn't
 * usable. Only emails count — anything else falls back to the caller's default so a garbage
 * value can never mint a fresh account bucket.
 */
export function normalizeAccount(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 320 || !v.includes("@") || /\s/.test(v)) return null;
  return v;
}

/** Make sure the accounts row exists (plan defaults to free). Idempotent. */
export async function ensureAccount(account: string, email?: string, name?: string): Promise<void> {
  await run(
    "INSERT OR IGNORE INTO accounts (id, email, name, plan, created_at) VALUES (?, ?, ?, 'free', ?)",
    [account, email ?? (account.includes("@") ? account : null), name ?? null, nowISO()],
  );
}

// ── Plans ────────────────────────────────────────────────────────────────────

export async function getPlan(account = DEFAULT_ACCOUNT): Promise<PlanId> {
  const row = await one<{ plan: string }>("SELECT plan FROM accounts WHERE id = ?", [account]);
  const p = (row?.plan ?? "free") as PlanId;
  return p in PLANS ? p : "free";
}

export async function setPlan(account: string, plan: PlanId): Promise<void> {
  if (!(plan in PLANS)) throw new Error(`unknown plan: ${plan}`);
  await run("UPDATE accounts SET plan = ? WHERE id = ?", [plan, account]);
}

/** Grant this month's plan Meals exactly once (deterministic PK). Free plan (0 monthly) skips. */
export async function ensureMonthlyGrant(account = DEFAULT_ACCOUNT): Promise<void> {
  const plan = await getPlan(account);
  const meals = PLANS[plan].monthlyMeals;
  if (meals <= 0) return;
  const month = utcMonth();
  await insertLedger(account, meals, `grant:${plan}:${month}`, `led_grant_${account}_${month}`);
}

/**
 * A paid plan landing from the payment provider (activation OR renewal — both are "make this
 * month whole for this plan"). Sets the plan, then tops up so this month's granted Meals equal the
 * plan's monthly total.
 *
 * The top-up diffs against the CUMULATIVE Meals already granted this month — the base grant PLUS
 * any prior upgrade rows — not just the base row. An ascending two-hop upgrade in one month
 * (starter→pro→studio) would otherwise double-count the intermediate step: pro adds +40 (20→60),
 * then studio computed against the base 20 alone would add +150 → 210 instead of 170. Diffing
 * against the running total makes each step top up to exactly the target plan, and the deterministic
 * per-plan id keeps every step replay-safe.
 */
export async function applyPlanPurchase(account: string, plan: PlanId): Promise<void> {
  await ensureAccount(account);
  await setPlan(account, plan);
  const month = utcMonth();
  const base = await one<{ delta: number }>("SELECT delta FROM credit_ledger WHERE id = ?", [`led_grant_${account}_${month}`]);
  if (!base) {
    // First plan grant of the month — just lay down the base monthly grant.
    await ensureMonthlyGrant(account);
    return;
  }
  // Cumulative Meals granted this month = base monthly grant + every upgrade top-up so far.
  const granted = await one<{ sum: number }>(
    "SELECT COALESCE(SUM(delta), 0) AS sum FROM credit_ledger WHERE account_id = ? AND (id = ? OR id LIKE ?)",
    [account, `led_grant_${account}_${month}`, `led_grantup_${account}_${month}_%`],
  );
  const diff = PLANS[plan].monthlyMeals - Number(granted?.sum ?? 0);
  if (diff > 0) await insertLedger(account, diff, `grant-upgrade:${plan}:${month}`, `led_grantup_${account}_${month}_${plan}`);
}

/** All periodic grants — call at the top of any metered route. */
export async function ensureGrants(account = DEFAULT_ACCOUNT): Promise<void> {
  await ensureTrialGrant(account);
  await ensureMonthlyGrant(account);
}

/** The GET /api/meals payload. `trial` describes the free taste: how many images it grants, how
 *  many days remain in the window, and whether it is currently active (free plan + still in-window). */
export async function mealsSnapshot(account = DEFAULT_ACCOUNT): Promise<{
  balance: number; plan: PlanId; enforced: boolean;
  trial: { images: number; daysLeft: number; active: boolean }; usedToday: number;
  costs: typeof MEAL_COSTS;
}> {
  await ensureGrants(account);
  const today = utcDay();
  const [balance, plan, usedToday, acct] = await Promise.all([
    currentBalance(account), getPlan(account), netSpendOn(account, today),
    one<{ created_at: string }>("SELECT created_at FROM accounts WHERE id = ?", [account]),
  ]);
  const msLeft = trialMsLeft(acct?.created_at);
  const trial = { images: trialImages(), daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)), active: plan === "free" && msLeft > 0 };
  // Owner accounts are uncapped, so the wallet reports "not enforced" for them — no out/low banners.
  return { balance, plan, enforced: enforcedFor(account), trial, usedToday, costs: MEAL_COSTS };
}
