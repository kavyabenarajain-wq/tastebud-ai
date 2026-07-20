import type { NextRequest } from "next/server";
import { mealsSnapshot, normalizeAccount, ensureAccount, DEFAULT_ACCOUNT } from "@/lib/store";
import { sessionEmail } from "@/lib/supabase/account";

export const runtime = "nodejs";
// Never statically optimized — grants must land per-request, not once at build time.
export const dynamic = "force-dynamic";

/**
 * GET /api/meals — the balance pill's data source. Calling it also lands the free-trial grant and
 * the month's plan grant (grant-on-first-touch; deterministic PKs make double-grants impossible).
 * The account is the VERIFIED Supabase session email when signed in; the ?account= query param is
 * only a pre-auth fallback, and no identity at all → the shared default bucket.
 */
export async function GET(req: NextRequest) {
  try {
    const account =
      (await sessionEmail()) ?? normalizeAccount(req.nextUrl.searchParams.get("account")) ?? DEFAULT_ACCOUNT;
    if (account !== DEFAULT_ACCOUNT) await ensureAccount(account);
    const snap = await mealsSnapshot(account);
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
