import { all, one, run, genId, nowISO } from "./db";

/**
 * Customer identity + activity — the "who came, their name, when, what they did" layer that feeds
 * the `customer_overview` CRM view. Kept separate from credits/payments so the money code stays
 * focused. All writes are keyed by the VERIFIED session email (the account id).
 */

export type ProfileInput = {
  email: string; // the verified account id
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  provider?: string | null; // 'google' | 'email' | …
};

/**
 * Create-or-update a customer profile from a verified session. Never blanks an existing field with
 * null (COALESCE), and always refreshes last_seen_at. Returns whether this was a first-time signup.
 */
export async function upsertProfile(p: ProfileInput): Promise<{ created: boolean }> {
  const id = p.email;
  const full = p.name || [p.firstName, p.lastName].filter(Boolean).join(" ") || null;
  const existing = await one<{ id: string }>("SELECT id FROM accounts WHERE id = ?", [id]);
  if (!existing) {
    await run(
      `INSERT OR IGNORE INTO accounts (id, email, name, first_name, last_name, provider, plan, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 'free', ?, ?)`,
      [id, p.email, full, p.firstName ?? null, p.lastName ?? null, p.provider ?? null, nowISO(), nowISO()],
    );
    return { created: true };
  }
  await run(
    `UPDATE accounts SET
       email        = COALESCE(email, ?),
       name         = COALESCE(?, name),
       first_name   = COALESCE(?, first_name),
       last_name    = COALESCE(?, last_name),
       provider     = COALESCE(?, provider),
       last_seen_at = ?
     WHERE id = ?`,
    [p.email, full, p.firstName ?? null, p.lastName ?? null, p.provider ?? null, nowISO(), id],
  );
  return { created: false };
}

/** Bump the account's last-seen stamp (cheap; called from the billing guard on each touch). */
export async function touchLastSeen(account: string): Promise<void> {
  await run("UPDATE accounts SET last_seen_at = ? WHERE id = ?", [nowISO(), account]);
}

/** Append one activity event (signup | signin | brand_created | purchase | generate | …). */
export async function logEvent(account: string, type: string, detail?: string | null): Promise<void> {
  await run("INSERT INTO events (id, account_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)", [genId("evt"), account, type, detail ?? null, nowISO()]);
}

/** Recent activity for an account — newest first. */
export async function listEvents(
  account: string,
  limit = 100,
): Promise<{ type: string; detail: string | null; created_at: string }[]> {
  return all("SELECT type, detail, created_at FROM events WHERE account_id = ? ORDER BY created_at DESC LIMIT ?", [account, limit]);
}
