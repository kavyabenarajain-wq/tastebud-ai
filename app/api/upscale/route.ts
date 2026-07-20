import type { NextRequest } from "next/server";
import { upscaleShot } from "@/lib/image";
import { numberToAspect } from "@/lib/brief";
import { enhanceEnabled, upscale } from "@/lib/enhance";
import { enlargeInPlace } from "@/lib/finish";
import { ensureGrants, charge, refund, normalizeAccount, DEFAULT_ACCOUNT } from "@/lib/store";
import { sessionEmail } from "@/lib/supabase/account";
import { MEAL_COSTS } from "@/lib/meals";

export const runtime = "nodejs";
export const maxDuration = 180;

// Upscale one finished shot for a print-ready keeper. Prefers a REAL super-resolution
// model (Replicate) that preserves the subject, then the Gemini 4K re-render — and, when
// neither key is configured, ALWAYS still delivers a crisp deterministic 4K (lanczos +
// re-sharpen) so the button is never a silent no-op.
export async function POST(req: NextRequest) {
  const { url, aspect, face, account: rawAccount } = (await req.json()) as { url: string; aspect?: number; face?: boolean; account?: string };
  if (!url) return Response.json({ error: "no url" }, { status: 400 });
  // MEALS — a keeper upscale costs 1. Observe mode records it; enforced mode refuses at zero.
  const account = (await sessionEmail()) ?? normalizeAccount(rawAccount) ?? DEFAULT_ACCOUNT;
  await ensureGrants(account).catch(() => {});
  const meal = await charge(account, MEAL_COSTS.upscale, "upscale").catch(() => ({ ok: true, balance: 0 }));
  if (!meal.ok) return Response.json({ error: "Out of Meals — top up on the pricing page to keep creating." }, { status: 402 });
  try {
    if (enhanceEnabled()) {
      const out = await upscale({ src: url, scale: 4, faceEnhance: !!face });
      return Response.json({ url: out, via: "replicate" });
    }
    if (process.env.GEMINI_API_KEY) {
      const id = `${Date.now()}-up-${Math.random().toString(36).slice(2, 7)}`;
      const out = await upscaleShot({ id, src: url, aspect: numberToAspect(aspect) });
      return Response.json({ url: out, via: "gemini" });
    }
    // No super-res key → deterministic sharp 4K, in place. Never errors, never a no-op.
    await enlargeInPlace(url, 4096);
    return Response.json({ url, via: "native" });
  } catch (err) {
    await refund(account, MEAL_COSTS.upscale, "refund:upscale").catch(() => {});
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
