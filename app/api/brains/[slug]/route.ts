import type { NextRequest } from "next/server";
import { getBrain, getMeta, getGuidelines, recordShotDecision } from "@/lib/brainStore";
import type { ShotMemory } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/brains/<slug> → the full brand brain (+ meta, + guidelines if built).
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const brain = await getBrain(slug);
  if (!brain) return Response.json({ error: "Not found" }, { status: 404 });
  const [meta, guidelines] = await Promise.all([getMeta(slug), getGuidelines(slug)]);
  return Response.json({ brain, meta, guidelines });
}

// POST /api/brains/<slug> → record one shot decision into the brand's memory.
// Body: { decision: ShotMemory }. Returns { ok, memory }.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = (await req.json().catch(() => ({}))) as { decision?: ShotMemory };
  const decision = body.decision;
  if (!decision?.id || !decision?.decision) {
    return Response.json({ error: "Bad decision" }, { status: 400 });
  }
  const memory = await recordShotDecision(params.slug, decision);
  if (!memory) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, memory });
}
