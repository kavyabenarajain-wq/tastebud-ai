import type { NextRequest } from "next/server";
import { upscaleShot } from "@/lib/image";
import { numberToAspect } from "@/lib/brief";
import { enhanceEnabled, upscale } from "@/lib/enhance";
import { enlargeInPlace } from "@/lib/finish";
import { ensureGrants, charge, refund, recordImage } from "@/lib/store";
import { currentAccount } from "@/lib/supabase/account";
import { MEAL_COSTS } from "@/lib/meals";

export const runtime = "nodejs";
export const maxDuration = 180;

// Upscale one finished shot for a print-ready keeper. Prefers a REAL super-resolution
// model (Replicate) that preserves the subject, then the Gemini 4K re-render — and, when
// neither key is configured, ALWAYS still delivers a crisp deterministic 4K (lanczos +
// re-sharpen) so the button is never a silent no-op.
export async function POST(req: NextRequest) {
  const { url, aspect, face } = (await req.json()) as { url: string; aspect?: number; face?: boolean };
  if (!url) return Response.json({ error: "no url" }, { status: 400 });
  // MEALS — a keeper upscale costs 1. Observe mode records it; enforced mode refuses at zero.
  // Identity is the VERIFIED session ONLY — never a client-supplied email. currentAccount() degrades
  // to the shared default bucket for an anonymous/blip caller, so it can't bill/attribute a victim.
  const account = await currentAccount();
  await ensureGrants(account).catch(() => {});
  const meal = await charge(account, MEAL_COSTS.upscale, "upscale").catch(() => ({ ok: true, balance: 0 }));
  if (!meal.ok) return Response.json({ error: "Out of Meals — top up on the pricing page to keep creating." }, { status: 402 });
  try {
    let out = url;
    let via = "native";
    if (enhanceEnabled()) {
      // FACE-ENHANCE IS OFF BY DEFAULT. GFPGAN/CodeFormer-style face restoration RE-SYNTHESISES the
      // face and smooths away exactly the real flaws (cuts, scars, blemishes, pores, asymmetry) we
      // fight to preserve — it would beautify a reference person into a cleaner stranger. Only honour
      // the client's `face` request when a deployment has explicitly opted in via UPSCALE_FACE_ENHANCE=1
      // (e.g. for a genuinely broken AI face); otherwise the identity-safe SUPIR/Real-ESRGAN texture
      // upscale runs without it. The env-selectable REPLICATE_UPSCALE_MODEL (SUPIR / crystal-upscaler)
      // adds real skin texture at high fidelity without inventing a new face.
      const allowFaceEnhance = process.env.UPSCALE_FACE_ENHANCE === "1";
      out = await upscale({ src: url, scale: 4, faceEnhance: !!face && allowFaceEnhance });
      via = "replicate";
    } else if (process.env.GEMINI_API_KEY) {
      const id = `${Date.now()}-up-${Math.random().toString(36).slice(2, 7)}`;
      out = await upscaleShot({ id, src: url, aspect: numberToAspect(aspect) });
      via = "gemini";
    } else {
      // No super-res key → deterministic sharp 4K, in place. Never errors, never a no-op.
      await enlargeInPlace(url, 4096);
    }
    // Record the keeper ONLY when a genuinely NEW url was minted (Replicate/Gemini). The native
    // path re-writes the SAME served url in place — already recorded at generation time — so
    // recording it again would duplicate the gallery row. Fire-and-forget; never blocks delivery.
    if (out !== url) void recordImage({ account, url: out, kind: "upscale" }).catch(() => {});
    return Response.json({ url: out, via });
  } catch (err) {
    await refund(account, MEAL_COSTS.upscale, "refund:upscale").catch(() => {});
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
