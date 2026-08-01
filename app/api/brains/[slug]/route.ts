import type { NextRequest } from "next/server";
import { getBrain, getMeta, getGuidelines, recordShotDecision } from "@/lib/brainStore";
import { DEFAULT_ACCOUNT, annotateLatestKill } from "@/lib/store";
import { currentAccount, isOperator } from "@/lib/supabase/account";
import { rememberBrand, rememberFounder } from "@/lib/memory";
import { background } from "@/lib/memory/bg";
import type { ShotMemory } from "@/lib/types";

export const runtime = "nodejs";

/** The account this brand read/write is scoped to: the signed-in customer, or — for an allowlisted
 *  operator asking with `?scope=internal` — the shared internal/discovery bucket the deck tool reads. */
async function accountForRequest(req: NextRequest): Promise<string> {
  if (req.nextUrl.searchParams.get("scope") === "internal" && (await isOperator())) return DEFAULT_ACCOUNT;
  return currentAccount();
}

// GET /api/brains/<slug> → the full brand brain (+ meta, + guidelines if built), scoped to the caller.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const account = await accountForRequest(req);
  const brain = await getBrain(slug, account);
  if (!brain) return Response.json({ error: "Not found" }, { status: 404 });
  const [meta, guidelines] = await Promise.all([getMeta(slug, account), getGuidelines(slug, account)]);
  return Response.json({ brain, meta, guidelines });
}

// POST /api/brains/<slug> → record one shot decision into the brand's memory.
// Body: { decision: ShotMemory }. Returns { ok, memory }.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = (await req.json().catch(() => ({}))) as { decision?: ShotMemory; annotate?: { id: string; reason?: string; failedBar?: string } };
  // Lightweight path: annotate the human "why" onto the most-recent kill-log row for a shot
  // (no new decision — the reject was already recorded on the decision POST).
  if (body.annotate?.id) {
    await annotateLatestKill(body.annotate.id, body.annotate.reason, body.annotate.failedBar);
    return Response.json({ ok: true });
  }
  const decision = body.decision;
  if (!decision?.id || !decision?.decision) {
    return Response.json({ error: "Bad decision" }, { status: 400 });
  }
  const account = await accountForRequest(req);
  const memory = await recordShotDecision(params.slug, decision, account);
  if (!memory) return Response.json({ error: "Not found" }, { status: 404 });

  // Mirror the taste signal into the external memory layer (fire-and-forget, no-op unless keyed):
  // brand-scoped always; a KEPT/HERO shot also seeds cross-brand founder taste. NL, never pixels.
  try {
    const verb = decision.decision === "reject" ? "rejected" : decision.decision === "hero" ? "picked as a hero" : "kept";
    const firstClause = (decision.prompt || "").split(/[.;\n]/)[0].trim().slice(0, 140);
    const line = `Founder ${verb} a ${decision.mode} shot — angle: ${decision.angle}${firstClause ? `; look: ${firstClause}` : ""}.`;
    background(rememberBrand(account, params.slug, "shot_decision", line, { decision: decision.decision, mode: decision.mode, angle: decision.angle }));
    if (decision.decision !== "reject") background(rememberFounder(account, "preference", line, { brandSlug: params.slug }));
  } catch { /* memory never blocks a decision */ }

  return Response.json({ ok: true, memory });
}
