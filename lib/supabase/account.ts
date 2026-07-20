import { supabaseServer, supabaseConfigured } from "./server";

/**
 * The VERIFIED signed-in email, straight from the Supabase session cookie — the identity the
 * Meals ledger should bill.
 *
 * Why this exists: metered routes used to bill `body.account`, i.e. whatever email the client
 * claimed, so anyone could spend (or inspect) another account's Meals. Routes now prefer this and
 * fall back to the client value only while auth is rolling out.
 *
 * Returns null (never throws) when Supabase isn't configured or nobody is signed in, so an
 * unauthenticated request still degrades to the shared default bucket instead of failing.
 */
export async function sessionEmail(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { data } = await supabaseServer().auth.getUser();
    const email = data.user?.email;
    return email && email.includes("@") ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
