import type { NextRequest } from "next/server";
import { runBackBrain } from "@/lib/backbrain";
import { saveBrain, saveGuidelines, slugify } from "@/lib/brainStore";
import type { BrandBrain } from "@/lib/types";

// Internal-only: the operator's "behind-the-brain" deck builder. Paste call notes +
// Notion answers → full brand-guidelines deck. The built brand is persisted to the
// SAME per-brand brain the Asset Studio reads, so a discovered brand becomes shootable.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { notes?: string; name?: string; slug?: string; exBranding?: string; referenceNotes?: string; references?: string[] };
  const notes = (body.notes ?? "").trim();
  const exBranding = (body.exBranding ?? "").trim() || undefined; // existing brand doc → rebrand context
  // Client's own references for the new identity: pasted notes (hex codes, font names, links) + uploaded images (logo / palette / type).
  const referenceNotes = (body.referenceNotes ?? "").trim() || undefined;
  const references = Array.isArray(body.references) ? body.references.filter((u) => typeof u === "string" && u).slice(0, 6) : [];
  if (notes.length < 40 && !exBranding && !referenceNotes && references.length === 0) {
    return Response.json({ error: "Paste the call notes / questionnaire answers first (a little more detail)." }, { status: 400 });
  }
  try {
    const { spec, pptx, research } = await runBackBrain(notes, body.name?.trim() || undefined, exBranding, { notes: referenceNotes, images: references });

    // Persist into the brand brain so the deck and its research flow into the Studio.
    let slug = body.slug;
    try {
      const name = (spec as { brandName?: string })?.brandName || body.name?.trim();
      if (name) {
        const r = research as { competitors?: string[]; sources?: number; aesthetic?: string } | undefined;
        const brain: BrandBrain = {
          name,
          research: r ? { competitors: r.competitors, sources: r.sources, aesthetic: r.aesthetic } : undefined,
        };
        const meta = await saveBrain(brain, { origin: "discovery" });
        slug = meta.slug;
        await saveGuidelines(slug, spec);
      }
    } catch {
      /* persistence is best-effort; the deck still returns */
    }

    return Response.json({ ok: true, spec, pptx, research, slug: slug ?? (body.name ? slugify(body.name) : undefined) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
