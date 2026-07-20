import { sessionEmail } from "@/lib/supabase/account";
import { supabaseConfigured } from "@/lib/supabase/server";
import {
  applyPlanPurchase,
  ensureAccount,
  logEvent,
  recordPayment,
  topUp,
  touchLastSeen,
} from "@/lib/store";
import { PLANS, TOPUP_PACKS, type PlanId } from "@/lib/meals";

/**
 * BILLING & SECURITY CORE — the single authority every payment/security tool routes through.
 *
 * DELIBERATELY deterministic, no LLM: an AI must never decide who gets credited or whether a
 * session is valid. This module owns the two invariants that matter:
 *
 *   1. IDENTITY comes only from the verified Supabase (Google) session — never a client value.
 *   2. MONEY credits exactly that verified account, exactly once, and is always audited.
 *
 * checkout + portal call `requireBuyer()`; the signature-verified webhook calls `grantTopup()` /
 * `grantPlan()`. Nothing else touches attribution or grants, so the invariants live in one place.
 */

export type Buyer = { email: string };
export type Denied = { error: string; status: number };
export function isDenied(x: Buyer | Denied): x is Denied {
  return "error" in x;
}

/**
 * Resolve the verified buyer from the session cookie, or a ready-to-return denial. Guarantees the
 * account row exists and refreshes last-seen. This is the ONLY approved way a route learns who is
 * paying — no route may read an email from the request body for attribution.
 */
export async function requireBuyer(): Promise<Buyer | Denied> {
  if (!supabaseConfigured()) return { error: "Sign-in isn't configured, so payments are disabled.", status: 503 };
  const email = await sessionEmail();
  if (!email) return { error: "Sign in with Google to continue.", status: 401 };
  await ensureAccount(email).catch(() => {});
  await touchLastSeen(email).catch(() => {});
  return { email };
}

type ChargeMeta = { buyable?: string | null; status: string; eventType?: string | null; email?: string | null; name?: string | null };

/**
 * Apply a verified top-up: grant the Meals (idempotent by payment_id), write the audit row, log the
 * event. Called only from the signature-verified webhook. Safe to replay — the deterministic ledger
 * id + ON CONFLICT make a re-delivery a no-op.
 */
export async function grantTopup(account: string, meals: number, paymentId: string, meta: ChargeMeta): Promise<void> {
  if (meals <= 0 || !paymentId) return;
  await ensureAccount(account, meta.email ?? undefined, meta.name ?? undefined);
  await topUp(account, meals, `dodo:${paymentId}`, `led_dodo_${paymentId}`);
  const pack = TOPUP_PACKS.find((p) => p.meals === meals);
  await recordPayment({
    id: paymentId, account, kind: "topup", buyable: meta.buyable ?? null,
    meals, amountUsd: pack?.priceUSD ?? null, status: meta.status, eventType: meta.eventType,
  });
  await logEvent(account, "purchase", `topup ${meals} Meals`);
}

/**
 * Apply a verified plan activation/renewal: make the month whole for the plan (idempotent), and —
 * when this came with a real charge (payment_id) — write the audit row and log the event.
 */
export async function grantPlan(account: string, plan: PlanId, paymentId: string | null | undefined, meta: ChargeMeta): Promise<void> {
  await applyPlanPurchase(account, plan);
  if (!paymentId) return; // subscription.* status syncs carry no charge — grant only, no audit row
  await recordPayment({
    id: paymentId, account, kind: "plan", plan, buyable: meta.buyable ?? plan,
    meals: PLANS[plan].monthlyMeals, amountUsd: PLANS[plan].priceUSD ?? null, status: meta.status, eventType: meta.eventType,
  });
  await logEvent(account, "purchase", `plan ${plan}`);
}
