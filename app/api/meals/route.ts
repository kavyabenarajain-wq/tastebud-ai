import { mealsSnapshot, ensureAccount, DEFAULT_ACCOUNT } from "@/lib/store";
import { currentAccount } from "@/lib/supabase/account";

export const runtime = "nodejs";
// Never statically optimized — grants must land per-request, not once at build time.
export const dynamic = "force-dynamic";

/**
 * GET /api/meals — the balance pill's data source. Calling it also lands the free-trial grant and
 * the month's plan grant (grant-on-first-touch; deterministic PKs make double-grants impossible).
 * The account is the VERIFIED Supabase session email ONLY (currentAccount) — a client-supplied
 * ?account= is never trusted, so nobody can read another account's billing snapshot. No session →
 * the shared default bucket (and the middleware already 401s anonymous callers in the normal case).
 */
export async function GET() {
  try {
    const account = await currentAccount();
    if (account !== DEFAULT_ACCOUNT) await ensureAccount(account);
    const snap = await mealsSnapshot(account);
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
