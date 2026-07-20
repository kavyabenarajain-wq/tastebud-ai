import type { NextRequest } from "next/server";
import { buyableForProduct, BUYABLES, verifyWebhookSignature } from "@/lib/dodo";
import { ensureAccount, normalizeAccount, setPlan } from "@/lib/store";
import { grantPlan, grantTopup } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/meals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — Dodo calls this when money moves. The ONLY place Meals are
 * granted for payments, so a lost redirect never loses a purchase and a forged request
 * can't mint Meals (Standard-Webhooks signature over the raw body).
 *
 * Idempotent by construction: every grant writes a DETERMINISTIC ledger id
 * (`led_dodo_<payment_id>`, `led_grant_<account>_<month>`, `led_grantup_…`), so Dodo's
 * retries and replays INSERT OR IGNORE instead of double-granting. Always answers 200 for
 * verified events — a handler hiccup must not make Dodo retry forever.
 */

type WebhookEvent = {
  type?: string;
  data?: {
    payload_type?: string;
    payment_id?: string;
    subscription_id?: string | null;
    product_id?: string;
    product_cart?: { product_id: string; quantity: number }[] | null;
    metadata?: Record<string, string> | null;
    customer?: { customer_id?: string; email?: string; name?: string } | null;
  };
};

/** The plan this event is about — metadata first (we stamp it at checkout AND on the Dodo product), then the product mapping. */
function planFrom(data: NonNullable<WebhookEvent["data"]>): PlanId | null {
  const metaPlan = data.metadata?.plan;
  if (metaPlan && metaPlan in PLANS) return metaPlan as PlanId;
  const ids = [data.product_id, ...(data.product_cart ?? []).map((c) => c.product_id)].filter(Boolean) as string[];
  for (const id of ids) {
    const b = buyableForProduct(id);
    if (b) {
      const what = BUYABLES[b];
      if (what.kind === "plan") return what.plan;
    }
  }
  return null;
}

/** Meals in this event's top-up pack — metadata first, then the product mapping. */
function packMealsFrom(data: NonNullable<WebhookEvent["data"]>): number {
  const meta = Number(data.metadata?.pack_meals);
  if (Number.isFinite(meta) && meta > 0) return Math.floor(meta);
  for (const item of data.product_cart ?? []) {
    const b = buyableForProduct(item.product_id);
    if (b) {
      const what = BUYABLES[b];
      if (what.kind === "topup") return what.meals * Math.max(1, item.quantity || 1);
    }
  }
  return 0;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const verdict = verifyWebhookSignature(req.headers, raw);
  if (!verdict.ok) {
    console.warn(`[billing] webhook rejected: ${verdict.reason}`);
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let evt: WebhookEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const type = evt.type ?? "";
  const data = evt.data ?? {};
  // metadata.account is what OUR checkout stamped; customer.email covers purchases made
  // through Dodo-side links (storefront, payment links) that never saw our metadata.
  const account = normalizeAccount(data.metadata?.account) ?? normalizeAccount(data.customer?.email);

  try {
    if (!account) {
      console.warn(`[billing] ${type}: no usable account (metadata/customer email missing) — ignored`);
      return Response.json({ received: true, ignored: "no account" });
    }

    // All grants + attribution + audit go through the billing CORE (lib/billing) — this route only
    // verifies the signature and parses the event, then hands the resolved facts to the core.
    const meta = { buyable: data.metadata?.buyable ?? null, status: type, eventType: type, email: data.customer?.email ?? null, name: data.customer?.name ?? null };
    if (type === "payment.succeeded") {
      if (data.subscription_id) {
        const plan = planFrom(data);
        if (plan) await grantPlan(account, plan, data.payment_id ?? null, meta);
      } else {
        const meals = packMealsFrom(data);
        if (meals > 0 && data.payment_id) {
          await grantTopup(account, meals, data.payment_id, meta);
          console.log(`[billing] +${meals} Meals → ${account} (${data.payment_id})`);
        }
      }
    } else if (type === "subscription.active" || type === "subscription.renewed" || type === "subscription.plan_changed") {
      const plan = planFrom(data);
      if (plan) {
        await grantPlan(account, plan, null, meta); // status sync: grant only, no charge/audit row
        console.log(`[billing] plan ${plan} → ${account} (${type})`);
      }
    } else if (
      type === "subscription.cancelled" ||
      type === "subscription.expired" ||
      type === "subscription.failed" ||
      type === "subscription.on_hold"
    ) {
      await ensureAccount(account);
      await setPlan(account, "free");
      console.log(`[billing] plan free → ${account} (${type})`);
    }
    // Everything else (refund/dispute/etc.) is acknowledged and left to the dashboard for now.

    return Response.json({ received: true });
  } catch (e) {
    // Log loudly but still 200 — the grant ids are deterministic, so a Dodo retry after a
    // transient store error will land it; a permanent bug shouldn't hammer us forever.
    console.error(`[billing] webhook handler error on ${type}:`, (e as Error).message);
    return Response.json({ received: true, error: "handler error (logged)" });
  }
}
