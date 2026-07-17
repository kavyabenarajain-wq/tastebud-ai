import { createHmac, timingSafeEqual } from "node:crypto";
import { type PlanId } from "@/lib/meals";

/**
 * Dodo Payments — the money seam. SERVER-ONLY (never import from client components).
 *
 * Deliberately SDK-free: three REST calls over fetch and a Standard-Webhooks HMAC check
 * cover everything we use, and this repo's npm tree is fragile enough (see the run-studio
 * skill's @swc/helpers landmine) that zero new dependencies is a feature.
 *
 * Dodo is the merchant of record — it owns checkout, tax, invoices and card data. We own
 * exactly one truth: the Meals ledger. Money in (webhook) → topUp()/applyPlanPurchase().
 */

/** The six purchasable things. The free tier is NOT a product — it's the default state. */
export type BuyableId = "starter" | "pro" | "studio" | "topup10" | "topup30" | "topup100";

export const BUYABLES: Record<BuyableId, { kind: "plan"; plan: PlanId } | { kind: "topup"; meals: number }> = {
  starter: { kind: "plan", plan: "starter" },
  pro: { kind: "plan", plan: "pro" }, // Chef's Table
  studio: { kind: "plan", plan: "studio" }, // Banquet
  topup10: { kind: "topup", meals: 10 },
  topup30: { kind: "topup", meals: 30 },
  topup100: { kind: "topup", meals: 100 },
};

/** Env-first product mapping; the checked-in fallbacks are the TEST-MODE ids. Live ids go in .env. */
function productIds(): Record<BuyableId, string> {
  const env = process.env;
  return {
    starter: env.DODO_PRODUCT_STARTER || "pdt_0NjOROpbMyuMGxE52YRYP",
    pro: env.DODO_PRODUCT_PRO || "pdt_0NjORZ08iVY5V35otf9rK",
    studio: env.DODO_PRODUCT_STUDIO || "pdt_0NjORWL3bbq38ysQpzKWl",
    topup10: env.DODO_PRODUCT_TOPUP10 || "pdt_0NjOSDHCd36sWdS7PXaWC",
    topup30: env.DODO_PRODUCT_TOPUP30 || "pdt_0NjOSLRYxACGDo8xsKApy",
    topup100: env.DODO_PRODUCT_TOPUP100 || "pdt_0NjOSTGtNIhqedF45b5I0",
  };
}

export function productIdFor(buyable: BuyableId): string {
  return productIds()[buyable];
}

export function buyableForProduct(productId: string): BuyableId | null {
  const ids = productIds();
  for (const key of Object.keys(ids) as BuyableId[]) if (ids[key] === productId) return key;
  return null;
}

export function dodoConfigured(): boolean {
  return !!process.env.DODO_PAYMENTS_API_KEY;
}

function apiBase(): string {
  if (process.env.DODO_API_BASE) return process.env.DODO_API_BASE.replace(/\/+$/, "");
  const live = (process.env.DODO_ENVIRONMENT || "test_mode") === "live_mode";
  return live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

async function dodo<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.DODO_PAYMENTS_API_KEY;
  if (!key) throw new Error("Payments aren't configured (DODO_PAYMENTS_API_KEY is unset).");
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body — fall through to the status error */
  }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message || text.slice(0, 300) || res.statusText;
    throw new Error(`Dodo ${res.status}: ${msg}`);
  }
  return json as T;
}

// ── Checkout ─────────────────────────────────────────────────────────────────

/**
 * One fresh checkout session per click (links expire and are single-use). `metadata.account`
 * is the contract with the webhook: whatever we put here comes back on the payment event and
 * decides whose ledger gets the Meals.
 */
export async function createCheckoutSession(opts: {
  buyable: BuyableId;
  email: string;
  name?: string;
  origin: string;
}): Promise<{ url: string; sessionId: string }> {
  const what = BUYABLES[opts.buyable];
  const metadata: Record<string, string> = {
    account: opts.email,
    buyable: opts.buyable,
    ...(what.kind === "plan" ? { plan: what.plan } : { pack_meals: String(what.meals) }),
  };
  const out = await dodo<{ session_id: string; checkout_url: string }>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: productIdFor(opts.buyable), quantity: 1 }],
      customer: { email: opts.email, ...(opts.name ? { name: opts.name } : {}) },
      return_url: `${opts.origin}/asset-studio?checkout=success`,
      metadata,
    }),
  });
  return { url: out.checkout_url, sessionId: out.session_id };
}

// ── Self-check + portal ──────────────────────────────────────────────────────

export async function listProducts(): Promise<{ product_id: string; name: string; is_recurring: boolean; price: number }[]> {
  const out = await dodo<{ items?: { product_id: string; name: string; is_recurring: boolean; price: number }[] }>(
    "/products?page_size=100",
  );
  return out.items ?? [];
}

export async function findCustomerId(email: string): Promise<string | null> {
  const out = await dodo<{ items?: { customer_id: string; email?: string }[] }>(
    `/customers?email=${encodeURIComponent(email)}&page_size=1`,
  );
  return out.items?.[0]?.customer_id ?? null;
}

/** Dodo-hosted "manage my subscription" page for an existing customer. */
export async function createPortalSession(customerId: string): Promise<string> {
  const out = await dodo<{ link: string }>(`/customers/${customerId}/customer-portal/session`, { method: "POST" });
  return out.link;
}

// ── Webhook verification (Standard Webhooks) ─────────────────────────────────

const TOLERANCE_SECONDS = 5 * 60;

/** The dashboard secret is usually `whsec_<base64>`; tolerate a bare value either way. */
function secretBytes(): Buffer | null {
  const raw = process.env.DODO_WEBHOOK_SECRET;
  if (!raw) return null;
  const stripped = raw.startsWith("whsec_") ? raw.slice(6) : raw;
  try {
    const b = Buffer.from(stripped, "base64");
    // Round-trip check — a non-base64 secret "decodes" to garbage that won't re-encode equal.
    if (b.length > 0 && b.toString("base64").replace(/=+$/, "") === stripped.replace(/=+$/, "")) return b;
  } catch {
    /* fall through to utf8 */
  }
  return Buffer.from(stripped, "utf8");
}

/**
 * Verify a Standard-Webhooks delivery: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with
 * the endpoint secret, compared (timing-safe) against every space-separated `v1,<sig>` the
 * header carries. Rejects stale/future timestamps beyond the tolerance window.
 */
export function verifyWebhookSignature(headers: Headers, rawBody: string): { ok: boolean; reason?: string } {
  const secret = secretBytes();
  if (!secret) return { ok: false, reason: "DODO_WEBHOOK_SECRET is unset" };
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return { ok: false, reason: "missing webhook headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };

  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest();
  for (const part of signatures.split(/\s+/)) {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}
