import type { NextRequest } from "next/server";
import { topUp, setPlan, ensureMonthlyGrant, getBalance, DEFAULT_ACCOUNT } from "@/lib/store";
import type { PlanId } from "@/lib/meals";
import { PLANS } from "@/lib/meals";

export const runtime = "nodejs";

/**
 * POST /api/meals/admin — the manual top-up / plan seam until Stripe lands (a webhook will call
 * the same topUp()/setPlan()). Guarded by the x-meals-admin header matching MEALS_ADMIN_SECRET;
 * when the env var is UNSET the route answers 404, so it is invisible-by-default in any
 * deployment that hasn't opted in. There is no user auth yet — this is operator-only.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MEALS_ADMIN_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  if (req.headers.get("x-meals-admin") !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as { action?: string; amount?: number; reason?: string; plan?: string };
    if (body.action === "topup") {
      const amount = Math.floor(Number(body.amount));
      if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "amount must be a positive integer" }, { status: 400 });
      const balance = await topUp(DEFAULT_ACCOUNT, amount, body.reason ?? "topup:manual");
      return Response.json({ ok: true, balance });
    }
    if (body.action === "setPlan") {
      const plan = String(body.plan ?? "");
      if (!(plan in PLANS)) return Response.json({ error: `unknown plan: ${plan}` }, { status: 400 });
      await setPlan(DEFAULT_ACCOUNT, plan as PlanId);
      await ensureMonthlyGrant(DEFAULT_ACCOUNT); // the new plan's grant lands immediately
      return Response.json({ ok: true, plan, balance: await getBalance() });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
