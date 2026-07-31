import { supabaseServer, supabaseConfigured } from "./server";
import { DEFAULT_ACCOUNT } from "@/lib/store";

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

/**
 * The account that OWNS this request's brand data — the verified session email, else the shared
 * anonymous bucket. This is what every brand route must scope by so one customer's brands stay
 * private to them.
 *
 * It DELIBERATELY ignores any client-supplied account/email: a caller can never read or write
 * another account's brands by claiming their email. Anonymous callers land in DEFAULT_ACCOUNT and
 * can only ever see that shared bucket — never a real customer's brands.
 */
export async function currentAccount(): Promise<string> {
  return (await sessionEmail()) ?? DEFAULT_ACCOUNT;
}

/**
 * Operator allowlist for the INTERNAL ops views (the deck builder + the discovery/default bucket).
 * Reuses the Meals owner allowlist unless OPS_OWNER_EMAILS is set; empty when neither is configured,
 * so nobody is an operator by default and the internal bucket is never exposed by accident.
 */
const OPS_OWNERS = new Set(
  (process.env.OPS_OWNER_EMAILS || process.env.MEALS_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/** True only for a VERIFIED session whose email is in the operator allowlist. */
export async function isOperator(): Promise<boolean> {
  const email = await sessionEmail();
  return !!email && OPS_OWNERS.has(email);
}
