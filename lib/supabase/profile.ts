import type { User } from "@supabase/supabase-js";
import { supabaseServer, supabaseConfigured } from "./server";
import { upsertProfile, logEvent } from "@/lib/store";

/**
 * Provision/refresh the customer profile from a VERIFIED Supabase user — the single place login
 * writes "who came, their name, avatar, how, when" into `accounts`.
 *
 * Idempotent: upsertProfile never blanks an existing field and always refreshes last_seen_at.
 *
 * `logActivity` controls whether a signup/signin EVENT is appended. It must be logged from exactly
 * ONE path per login — the OAuth callback (the true login moment). AuthSync's /api/account/sync ping
 * fires on EVERY page load, so it must NOT log, or the activity timeline inflates by one row per
 * navigation. Kept in its own file (not lib/supabase/account.ts) to stay clear of concurrent edits.
 */
export async function syncProfileFromUser(
  user: User | null | undefined,
  opts: { logActivity?: boolean } = {},
): Promise<{ email: string | null; created: boolean }> {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return { email: null, created: false };

  const meta = (user!.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const provider = str((user!.app_metadata as Record<string, unknown> | undefined)?.provider) ?? "email";

  const { created } = await upsertProfile({
    email,
    firstName: str(meta.given_name),
    lastName: str(meta.family_name),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
    provider,
  });
  if (opts.logActivity !== false) await logEvent(email, created ? "signup" : "signin", provider);
  return { email, created };
}

/**
 * Same, but resolves the user from the session cookie via getUser(). Use this from a normal request
 * (e.g. /api/account/sync) where the cookie is on the INCOMING request. NOT reliable inside the
 * OAuth callback, where the session cookie is only on the OUTGOING response within that request —
 * there, pass the exchange's `data.session.user` to syncProfileFromUser() directly.
 *
 * Does NOT log an activity event (the callback already did) — this ping runs on every page load.
 */
export async function syncSignedInProfile(): Promise<{ email: string | null; created: boolean }> {
  if (!supabaseConfigured()) return { email: null, created: false };
  const { data } = await supabaseServer().auth.getUser();
  return syncProfileFromUser(data.user, { logActivity: false });
}
