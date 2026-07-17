import type { NextRequest } from "next/server";
import { BUYABLES, type BuyableId, createCheckoutSession, dodoConfigured, listProducts, productIdFor } from "@/lib/dodo";
import { normalizeAccount } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout — start a Dodo checkout for one buyable (plan or top-up pack).
 * Returns { url } to redirect the browser to. One fresh session per click; the webhook does
 * all granting, so nothing here touches the ledger.
 */
export async function POST(req: NextRequest) {
  let body: { product?: string; email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const buyable = body.product as BuyableId;
  if (!buyable || !(buyable in BUYABLES)) return Response.json({ error: `unknown product: ${body.product}` }, { status: 400 });
  const email = normalizeAccount(body.email);
  if (!email) return Response.json({ error: "A valid account email is required — sign in first." }, { status: 400 });
  if (!dodoConfigured()) return Response.json({ error: "Payments aren't configured yet." }, { status: 503 });

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || `${proto}://${host}`;

  try {
    const session = await createCheckoutSession({
      buyable,
      email,
      name: body.name?.trim() || undefined,
      origin: origin.replace(/\/+$/, ""),
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("[billing] checkout failed:", (e as Error).message);
    return Response.json({ error: "Couldn't start checkout. Try again in a moment." }, { status: 502 });
  }
}

/**
 * GET /api/billing/checkout — mapping self-check. Shows which Dodo product each buyable
 * points at and (when the API key is set) the live product names, so a mixed-up .env
 * mapping is visible in ten seconds instead of at grant time.
 */
export async function GET() {
  const mapping = (Object.keys(BUYABLES) as BuyableId[]).map((b) => ({ buyable: b, product_id: productIdFor(b) }));
  if (!dodoConfigured()) return Response.json({ configured: false, mapping });
  try {
    const live = await listProducts();
    const byId = new Map(live.map((p) => [p.product_id, p]));
    return Response.json({
      configured: true,
      mapping: mapping.map((m) => ({
        ...m,
        dodo_name: byId.get(m.product_id)?.name ?? "⚠ NOT FOUND IN DODO",
        dodo_price_usd: (byId.get(m.product_id)?.price ?? 0) / 100,
        recurring: byId.get(m.product_id)?.is_recurring ?? null,
      })),
    });
  } catch (e) {
    return Response.json({ configured: true, mapping, error: (e as Error).message }, { status: 502 });
  }
}
