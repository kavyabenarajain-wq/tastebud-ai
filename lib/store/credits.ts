import { getDb, tx, nowISO, genId, DEFAULT_ACCOUNT } from "./db";

/**
 * Credits — the payments SEAM. Designed now, enforced later.
 *
 * An append-only ledger per account; balance is the last row's balance_after. `charge()` is
 * the single choke point a generation would call — but it is INERT until CREDITS_ENFORCED=1,
 * so nothing is gated today. When payments land, flip the env, wire Stripe top-ups to
 * `topUp()`, and call `charge()` before a shoot. No call sites move.
 */

const ENFORCED = process.env.CREDITS_ENFORCED === "1";

export function creditsEnforced(): boolean {
  return ENFORCED;
}

function currentBalance(account: string): number {
  const row = getDb().prepare("SELECT balance_after FROM credit_ledger WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(account) as unknown as { balance_after: number } | undefined;
  return row?.balance_after ?? 0;
}

export async function getBalance(account = DEFAULT_ACCOUNT): Promise<number> {
  return currentBalance(account);
}

/** Add credits (a Stripe purchase, a grant). Returns the new balance. */
export async function topUp(account: string, amount: number, reason = "top-up"): Promise<number> {
  return tx(() => {
    const bal = currentBalance(account) + amount;
    getDb().prepare("INSERT INTO credit_ledger (id, account_id, delta, reason, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(genId("led"), account, amount, reason, bal, nowISO());
    return bal;
  });
}

/**
 * Spend credits for an action. Returns { ok, balance }. While unenforced it always succeeds
 * and writes nothing (the seam exists, the enforcement doesn't). Once enforced it debits
 * atomically and refuses when the balance is short.
 */
export async function charge(account: string, amount: number, reason: string): Promise<{ ok: boolean; balance: number }> {
  if (!ENFORCED) return { ok: true, balance: currentBalance(account) };
  return tx(() => {
    const cur = currentBalance(account);
    if (cur < amount) return { ok: false, balance: cur };
    const bal = cur - amount;
    getDb().prepare("INSERT INTO credit_ledger (id, account_id, delta, reason, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(genId("led"), account, -amount, reason, bal, nowISO());
    return { ok: true, balance: bal };
  });
}
