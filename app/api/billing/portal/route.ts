import type { NextRequest } from "next/server";
import { createPortalSession, dodoConfigured, findCustomerId } from "@/lib/dodo";
import { isDenied, requireBuyer } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal — a link to Dodo's hosted customer portal (invoices, card,
 * cancel/change subscription). 404 until the caller has actually bought something.
 *
 * AUTHORIZATION: the portal is opened for the VERIFIED session email ONLY. It deliberately does
 * not read any email from the request body — doing so was an IDOR that let any caller open another
 * person's billing (invoices, saved card, cancel their subscription) just by knowing their email.
 * A caller can now only ever reach their OWN billing profile.
 */
export async function POST(_req: NextRequest) {
  // Authorization is the billing core's job — the portal opens for the verified session ONLY.
  const buyer = await requireBuyer();
  if (isDenied(buyer)) return Response.json({ error: buyer.error }, { status: buyer.status });
  const email = buyer.email;
  if (!dodoConfigured()) return Response.json({ error: "Payments aren't configured yet." }, { status: 503 });

  try {
    const customerId = await findCustomerId(email);
    if (!customerId) return Response.json({ error: "No billing profile yet — it appears after your first purchase." }, { status: 404 });
    const url = await createPortalSession(customerId);
    return Response.json({ url });
  } catch (e) {
    console.error("[billing] portal failed:", (e as Error).message);
    return Response.json({ error: "Couldn't open the billing portal. Try again in a moment." }, { status: 502 });
  }
}
