import type { NextRequest } from "next/server";
import { mealsSnapshot, normalizeAccount, ensureAccount, DEFAULT_ACCOUNT } from "@/lib/store";

export const runtime = "nodejs";
// Never statically optimized — the drip must land per-request, not once at build time.
export const dynamic = "force-dynamic";

/**
 * GET /api/meals?account=<email> — the balance pill's data source. Calling it also lands
 * today's daily drip and the month's plan grant (grant-on-first-touch; deterministic PKs make
 * double-grants impossible), so simply opening the studio delivers the day's free Meals.
 * No account param → the shared default bucket (pre-auth behaviour, unchanged).
 */
export async function GET(req: NextRequest) {
  try {
    const account = normalizeAccount(req.nextUrl.searchParams.get("account")) ?? DEFAULT_ACCOUNT;
    if (account !== DEFAULT_ACCOUNT) await ensureAccount(account);
    const snap = await mealsSnapshot(account);
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
