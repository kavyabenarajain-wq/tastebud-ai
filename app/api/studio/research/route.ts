import type { NextRequest } from "next/server";
import { researchBrand } from "@/lib/research";
import { saveBrain } from "@/lib/brainStore";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Streaming brand research for the Asset Studio onboarding. Given just a brand name +
 * category, it runs the full research pipeline and streams live milestones (site found,
 * catalogue harvested, palette pulled, intelligence built) as NDJSON so the research
 * screen can narrate what the AI is actually doing. Persists the finished Brand Brain
 * to the brand's folder and returns it in the final `done` event.
 *
 * The client owns the paced stage animation; the server supplies the real details and
 * the finish signal — so the experience is honest AND always reads deliberately.
 */
export async function POST(req: NextRequest) {
  const { name, category, website } = (await req.json().catch(() => ({}))) as { name?: string; category?: string; website?: string };
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* closed */ }
      };
      try {
        if (!name?.trim()) { send({ type: "error", error: "Missing brand name" }); controller.close(); return; }
        const brain: BrandBrain = {
          name: name.trim(),
          category: category?.trim() || undefined,
          website: website?.trim() || undefined,
          // Seed the research hint so the pipeline can prefer the site the user pasted.
          research: website?.trim() ? { website: website.trim() } : undefined,
        };
        send({ type: "start", name: brain.name, category: brain.category, website: brain.website });

        const full = await researchBrand(brain, {
          onStage: (key, data) => {
            if (key === "website") send({ type: "meta", website: data?.website, instagram: data?.instagram, competitors: data?.competitors });
            else if (key === "catalog") send({ type: "detail", key: "catalog", productCount: data?.count ?? 0 });
            else if (key === "images") send({ type: "detail", key: "images", imageCount: data?.count ?? 0, palette: data?.palette ?? [] });
            else if (key === "intelligence") send({ type: "stage", key: "intelligence", status: "ready" });
          },
        });

        const { intelligence, catalog, ...research } = full;
        const finalBrain: BrandBrain = { ...brain, research, intelligence, catalog, ready: true };

        // Persist to the brand's own folder so research done once is reused everywhere.
        try { await saveBrain(finalBrain, { origin: "studio" }); } catch { /* non-fatal */ }

        send({ type: "done", brain: finalBrain });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
