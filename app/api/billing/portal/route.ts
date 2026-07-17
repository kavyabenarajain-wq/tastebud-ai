import type { NextRequest } from "next/server";
import { createPortalSession, dodoConfigured, findCustomerId } from "@/lib/dodo";
import { normalizeAccount } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal — a link to Dodo's hosted customer portal (invoices, card,
 * cancel/change subscription). 404 until the email has actually bought something.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const email = normalizeAccount(body.email);
  if (!email) return Response.json({ error: "A valid account email is required." }, { status: 400 });
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
