import { all, run, nowISO } from "./db";

/**
 * The payments audit trail — an append-only record of every VERIFIED Dodo payment. The
 * credit_ledger stays the source of truth for BALANCES; this answers "what was paid, by whom,
 * when" for support, reconciliation and a future billing-history UI. One row per payment,
 * keyed by the Dodo payment_id, so it is idempotent under webhook replays (same PK → no-op).
 */
export type PaymentRecord = {
  id: string; // Dodo payment_id — the idempotency key
  account: string; // the VERIFIED buyer email (whose ledger was credited)
  kind: "topup" | "plan";
  buyable?: string | null; // starter / pro / studio / topup10 / …
  plan?: string | null;
  meals?: number; // Meals this payment granted
  amountUsd?: number | null; // charged amount, when known from the price table
  status: string; // the webhook event that recorded it, e.g. "payment.succeeded"
  eventType?: string | null;
};

export async function recordPayment(p: PaymentRecord): Promise<void> {
  await run(
    `INSERT OR IGNORE INTO payments (id, account_id, kind, buyable, plan, meals, amount_usd, status, event_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.account, p.kind, p.buyable ?? null, p.plan ?? null, p.meals ?? 0, p.amountUsd ?? null, p.status, p.eventType ?? null, nowISO()],
  );
}

/** Recent payments for an account — newest first (for a billing-history view). */
export async function listPayments(
  account: string,
  limit = 50,
): Promise<{ id: string; kind: string; buyable: string | null; plan: string | null; meals: number; amount_usd: number | null; status: string; created_at: string }[]> {
  return all(
    "SELECT id, kind, buyable, plan, meals, amount_usd, status, created_at FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
    [account, limit],
  );
}
