import { one, run, nowISO, genId, DEFAULT_ACCOUNT } from "./db";
import { DAILY_DRIP, PLANS, MEAL_COSTS, type PlanId } from "../meals";

/**
 * Meals — the usage ledger (né credits). 1 Meal = 1 delivered image.
 *
 * An append-only ledger per account. Balance is SUM(delta) — order-independent, so interleaved
 * writes from two tabs / two serverless instances can never corrupt it (balance_after stays on
 * each row as an informational snapshot only). Grants use DETERMINISTIC primary keys with
 * INSERT OR IGNORE, so the daily drip and monthly plan grant are double-grant-proof at the DB
 * level with no cron and no SELECT-then-INSERT race.
 *
 * OBSERVE MODE (CREDITS_ENFORCED unset/0 — the default): every charge/refund/grant WRITES its
 * ledger row so real usage accumulates from day one, but nothing ever refuses — balances may go
 * negative and the UI clamps display at 0. Flipping CREDITS_ENFORCED=1 changes exactly one
 * behaviour: charges refuse (or partially grant) when the balance is short. Stripe lands on
 * `topUp()`; real auth lands by threading a real account id instead of DEFAULT_ACCOUNT.
 */

const ENFORCED = process.env.CREDITS_ENFORCED === "1";

// Owner accounts are UNCAPPED — the daily-Meals cap never applies to them. Everyone else (free
// accounts) is held to their balance (3/day drip when unpaid). Set MEALS_OWNER_EMAIL to a comma-
// separated allowlist of owner emails; matched case-insensitively against the billing account.
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

/** Server-side drip override (ops toggle); falls back to the published DAILY_DRIP. */
function dripAmount(): number {
  const n = Number(process.env.MEALS_DAILY_DRIP);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DAILY_DRIP;
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

/**
 * Grant today's daily drip exactly once (deterministic PK → INSERT OR IGNORE), expiring the
 * previous drip's unused remainder first (use-or-lose, drip-spends-first convention). Only the
 * most recent drip day can ever be pending — absent days were never granted.
 */
const grantedDays = new Map<string, string>(); // account → last day handled by this process
export async function ensureDailyGrant(account = DEFAULT_ACCOUNT): Promise<void> {
  const today = utcDay();
  if (grantedDays.get(account) === today) return; // memo: zero queries on repeat calls in-process
  const drip = dripAmount();
  // Expire the previous drip's unused remainder (skip when it was fully spent).
  const last = await one<{ id: string }>(
    "SELECT id FROM credit_ledger WHERE account_id = ? AND reason LIKE 'drip:%' ORDER BY created_at DESC LIMIT 1", [account]);
  if (last?.id) {
    const lastDay = last.id.slice(-10); // led_drip_<account>_<YYYY-MM-DD>
    if (/^\d{4}-\d{2}-\d{2}$/.test(lastDay) && lastDay < today) {
      const spent = await netSpendOn(account, lastDay);
      const unused = Math.max(0, drip - spent);
      if (unused > 0) await insertLedger(account, -unused, `drip-expire:${lastDay}`, `led_dripexp_${account}_${lastDay}`);
    }
  }
  if (drip > 0) await insertLedger(account, drip, `drip:${today}`, `led_drip_${account}_${today}`);
  grantedDays.set(account, today);
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
 * month whole for this plan"). Sets the plan, then grants this month's Meals. If a smaller
 * plan's grant already landed this month (same-month upgrade), tops up the DIFFERENCE with its
 * own deterministic id — so re-deliveries and replays can never double-grant.
 */
export async function applyPlanPurchase(account: string, plan: PlanId): Promise<void> {
  await ensureAccount(account);
  await setPlan(account, plan);
  const month = utcMonth();
  const existing = await one<{ delta: number }>("SELECT delta FROM credit_ledger WHERE id = ?", [`led_grant_${account}_${month}`]);
  if (!existing) {
    await ensureMonthlyGrant(account);
    return;
  }
  const diff = PLANS[plan].monthlyMeals - Number(existing.delta ?? 0);
  if (diff > 0) await insertLedger(account, diff, `grant-upgrade:${plan}:${month}`, `led_grantup_${account}_${month}_${plan}`);
}

/** All periodic grants — call at the top of any metered route. */
export async function ensureGrants(account = DEFAULT_ACCOUNT): Promise<void> {
  await ensureDailyGrant(account);
  await ensureMonthlyGrant(account);
}

/** The GET /api/meals payload. */
export async function mealsSnapshot(account = DEFAULT_ACCOUNT): Promise<{
  balance: number; plan: PlanId; enforced: boolean;
  drip: { amount: number; date: string }; usedToday: number;
  costs: typeof MEAL_COSTS;
}> {
  await ensureGrants(account);
  const today = utcDay();
  const [balance, plan, usedToday] = await Promise.all([
    currentBalance(account), getPlan(account), netSpendOn(account, today),
  ]);
  // Owner accounts are uncapped, so the wallet reports "not enforced" for them — no out/low banners.
  return { balance, plan, enforced: enforcedFor(account), drip: { amount: dripAmount(), date: today }, usedToday, costs: MEAL_COSTS };
}
