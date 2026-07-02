import type { NextRequest } from "next/server";
import { reformatImage } from "@/lib/reformat";
import { qcImage } from "@/lib/image";
import { complianceTail } from "@/lib/compliance";
import { formatAspect, FORMATS } from "@/lib/creativeTypes";
import type { ShotCompliance } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/reformat — adapt an existing keeper to another placement, fidelity-safe
 * (crop / outpaint / pad — never a silent re-render). The shot's stored compliance
 * rides through the edit, and a best-effort product-fidelity QC flags any drift.
 * Body: { src, format? | aspect?, compliance?, productRef?, brand? }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      src?: string;
      format?: string; // a lib/creativeTypes FORMATS key ("feed" | "square" | "story" | "landscape")
      aspect?: string; // or a raw aspect string ("9:16")
      compliance?: ShotCompliance;
      productRef?: string;
      brand?: string;
    };
    if (!body.src) return Response.json({ error: "src required" }, { status: 400 });
    const targetAspect = body.format && FORMATS[body.format as keyof typeof FORMATS] ? formatAspect(body.format) : body.aspect;
    if (!targetAspect) return Response.json({ error: "format or aspect required" }, { status: 400 });

    const constraints = body.compliance ? complianceTail(body.compliance) : undefined;
    const { url, method } = await reformatImage({ src: body.src, targetAspect, constraints });

    // The regenerated region is scene-only, but verify anyway when we CAN see the real
    // product — mirror /api/enhance's best-effort drift check (pass-on-failure).
    let drift = false;
    let driftReasons: string[] = [];
    if (method === "outpaint" && body.productRef) {
      try {
        const verdict = await qcImage({
          url,
          checklist: body.compliance?.doNot?.slice(0, 8) ?? [],
          brand: body.brand ?? "the brand",
          productRef: body.productRef,
        });
        drift = !verdict.pass;
        driftReasons = verdict.reasons ?? [];
      } catch {
        /* best-effort */
      }
    }
    return Response.json({ url, method, aspect: targetAspect, drift, driftReasons });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
