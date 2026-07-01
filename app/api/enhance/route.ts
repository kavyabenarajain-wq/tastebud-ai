import type { NextRequest } from "next/server";
import { enhanceEnabled, removeBackground, relight, editImage, upscale } from "@/lib/enhance";
import { complianceTail } from "@/lib/compliance";
import { qcImage } from "@/lib/image";
import type { ShotCompliance } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  action: "cutout" | "relight" | "edit" | "upscale";
  src: string;
  prompt?: string;
  face?: boolean;
  compliance?: ShotCompliance; // the shot's stored rules — re-applied so the edit stays on-brand
  productRef?: string; // the original product image, for the post-edit fidelity re-check
  brand?: string;
};

// Capability probe — the UI shows enhancer buttons only when this is enabled.
export async function GET() {
  return Response.json({ enabled: enhanceEnabled() });
}

// Open-source creative enhancers (Replicate). One route, switched by `action`.
export async function POST(req: NextRequest) {
  const { action, src, prompt, face, compliance, productRef, brand } = (await req.json()) as Body;
  if (!src) return Response.json({ error: "no src" }, { status: 400 });
  if (!enhanceEnabled()) return Response.json({ error: "Enhancers are off — set REPLICATE_API_TOKEN to enable." }, { status: 503 });
  const tail = complianceTail(compliance);
  try {
    let url: string;
    switch (action) {
      case "cutout": url = await removeBackground({ src }); break;
      case "relight": url = await relight({ src, prompt: prompt || "natural, soft, motivated studio light, consistent with the scene", constraints: tail }); break;
      case "edit": url = await editImage({ src, instruction: prompt || "", constraints: tail }); break;
      case "upscale": url = await upscale({ src, scale: 4, faceEnhance: !!face }); break;
      default: return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
    // Post-edit compliance re-check (best-effort, non-blocking): did the edit drift off the
    // product/do-not? Reuses qcImage — no new QC model. Only when we have the original + rules.
    let drift = false;
    let driftReasons: string[] = [];
    if (compliance && productRef && (action === "edit" || action === "relight")) {
      const verdict = await qcImage({ url, checklist: compliance.doNot, brand: brand || "the brand", productRef });
      drift = !verdict.pass;
      driftReasons = verdict.reasons;
    }
    return Response.json({ url, drift, driftReasons });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
