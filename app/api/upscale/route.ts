import type { NextRequest } from "next/server";
import { upscaleShot } from "@/lib/image";
import { numberToAspect } from "@/lib/brief";
import { enhanceEnabled, upscale } from "@/lib/enhance";
import { enlargeInPlace } from "@/lib/finish";

export const runtime = "nodejs";
export const maxDuration = 180;

// Upscale one finished shot for a print-ready keeper. Prefers a REAL super-resolution
// model (Replicate) that preserves the subject, then the Gemini 4K re-render — and, when
// neither key is configured, ALWAYS still delivers a crisp deterministic 4K (lanczos +
// re-sharpen) so the button is never a silent no-op.
export async function POST(req: NextRequest) {
  const { url, aspect, face } = (await req.json()) as { url: string; aspect?: number; face?: boolean };
  if (!url) return Response.json({ error: "no url" }, { status: 400 });
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
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
