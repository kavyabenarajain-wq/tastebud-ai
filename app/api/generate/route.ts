import type { NextRequest } from "next/server";
import { readSkill, loadIndustryPlaybook } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { artDirect, activeBrain, fallbackPlan, STANDARD_PRODUCT_ANGLES, DETAIL_SHOTS } from "@/lib/llm";
import { renderShot, renderModelShot, activeRenderer, qcImage, analyzeProduct } from "@/lib/image";
import type { ResolvedBrief, BrandProfile } from "@/lib/types";
import { buildBrief, buildModelBrief, counts, formatToAspect } from "@/lib/brief";
import { brainToProfile } from "@/lib/onboard";
import { buildCompliance, complianceToNegatives } from "@/lib/compliance";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Compact a brand's accumulated memory into the small {approved, rejected, preferences}
 * shape the planner reads — short "angle — first prompt clause" strings, hard-capped so
 * the art-director prompt never bloats. Hero shots rank first among the approved.
 */
function compactMemory(brain: ResolvedBrief["brand"]): { approved: string[]; rejected: string[]; preferences: string[] } | undefined {
  const m = brain?.memory;
  if (!m) return undefined;
  const clause = (s: { angle?: string; prompt?: string }) => {
    const first = (s.prompt || "").split(/[.;\n]/)[0].trim().slice(0, 90);
    return [s.angle, first].filter(Boolean).join(" — ").slice(0, 120);
  };
  const approved = [...(m.heroShots ?? []), ...(m.approvedShots ?? [])].slice(0, 5).map(clause).filter(Boolean);
  const rejected = (m.rejectedShots ?? []).slice(0, 5).map(clause).filter(Boolean);
  const preferences = (m.learnedPreferences ?? []).slice(0, 5);
  if (!approved.length && !rejected.length && !preferences.length) return undefined;
  return { approved, rejected, preferences };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResolvedBrief;
  const mode = body.mode === "model-photoshoot" ? "model-photoshoot" : "product-photoshoot";
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const isModel = mode === "model-photoshoot";
        send({ type: "status", phase: "art-direction", brain: activeBrain(), renderer: activeRenderer() });

        const skill = await readSkill(mode);
        const profile: BrandProfile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => ({ id: "none", name: body.brand?.name || "Brand" }));
        const { angles, perAngle, total } = counts(body);
        const sceneBrief = isModel ? buildModelBrief(body) : buildBrief(body);
        // Route to the product's INDUSTRY PLAYBOOK (perfume → fragrance.md, etc.) and inject it
        // for real — the master skill only NAMES the playbooks; the planner needs the actual text.
        // Detect from the brand's category/products + this brief. Product mode only.
        const rb = (profile.rulebook ?? {}) as Record<string, unknown>;
        const routeText = [
          body.brand?.category, body.brand?.productType, body.brand?.name,
          rb.category, rb.productType, rb.aesthetic, profile.name,
          body.express, sceneBrief,
        ].filter((v) => typeof v === "string").join(" \n ");
        // Load the category playbook for BOTH modes — a model shoot still needs the
        // product's category taste (palette/surface/substance/mood) so the product reads right.
        const industry = await loadIndustryPlaybook(routeText).catch(() => null);
        if (industry) send({ type: "status", phase: "industry", playbook: industry.label });
        // Product angle direction: the STANDARD angles guarantee camera VARIETY across the
        // set, but they are a coverage backbone — NOT a rigid catalogue sequence. The art
        // director leads with editorial TASTE treatments and uses these to keep angles
        // genuinely distinct; one clean straight-on hero stays in for fidelity.
        const angleGuide = isModel
          ? ""
          : `\n\nCAMERA VARIETY — across the ${angles} shot${angles > 1 ? "s" : ""}, make the camera angles genuinely DISTINCT (avoid near-duplicates). Use these STANDARD PRODUCT ANGLES as the variety backbone, and ALWAYS keep one clean straight-on eye-level hero for product fidelity: ${STANDARD_PRODUCT_ANGLES.slice(0, 6).map((a, i) => `${i + 1}) ${a}`).join("; ")}. ` +
            `But this is a CREATIVE shoot, not a catalogue: choose an editorial TASTE treatment per shot (see the taste library) and pair it with a fitting angle — do NOT just march down the standard list. For detail / texture coverage, draw from the DETAIL SHOTS: ${DETAIL_SHOTS.join(", ")}. Tag every shot with a short angle/treatment label.`;
        const brief =
          `${sceneBrief}\n\n` +
          `SHOT COUNT — produce EXACTLY ${angles} DISTINCT ${isModel ? "frame" : "camera angle"}${angles > 1 ? "s" : ""}, and for EACH ${isModel ? "frame" : "angle"} ${perAngle} shot${perAngle > 1 ? "s" : ""} ` +
          `${perAngle > 1 ? "(variations — slightly different framing, pose, styling or crop)" : ""}. ` +
          `Total ${total} shots. Tag every shot with its ${isModel ? "frame label" : "angle"}. ` +
          `${isModel ? "Keep the SAME person, wardrobe, light and grade across the set so it reads as one coherent shoot." : "Keep light, surface and treatment consistent so the set reads as one shoot."}` +
          angleGuide;
        // Vision pre-pass: LOOK at the uploaded product so the (otherwise blind) art
        // director can key the scene to the real packaging colour. Runs whenever a product
        // is present — in model mode too, so the set/wardrobe harmonise with the product.
        // Best-effort — null just falls back to brand text.
        const heroProduct = (body.products ?? []).filter(Boolean)[0];
        const observed = !heroProduct ? null : await analyzeProduct(heroProduct).catch(() => null);
        if (observed?.colors.length) send({ type: "status", phase: "product-colour", colors: observed.colors });
        // Brand memory — the "sharper every campaign" loop. Compact the founder's kept /
        // rejected art-direction into short clauses the planner can lean on (bounded).
        const memory = compactMemory(body.brand);
        if (memory) send({ type: "status", phase: "memory", approved: memory.approved.length, rejected: memory.rejected.length });
        let plan;
        try {
          plan = await artDirect({ skill, profile, brief, industry, productColors: observed?.colors, productMaterial: observed?.material, forModel: isModel, memory });
        } catch {
          // Brain unreachable → deterministic plan so the shoot still renders.
          plan = fallbackPlan(sceneBrief, angles, perAngle, mode);
        }
        const planned = plan.shots.slice(0, total);
        const aspect = formatToAspect(body.panel?.format);

        // Storyboard: hand the client every shot up front so it can show skeleton cards.
        const stamp = Date.now();
        const stubs = planned.map((s, idx) => ({ id: `${stamp}-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`, angle: s.angle }));
        send({ type: "plan", angles: plan.angles, count: planned.length, qc: plan.qc, aspect, shots: stubs });

        const products = body.products ?? [];
        const modelRefs = body.modelRefs ?? [];

        // References are STYLE/look references the client EXPLICITLY added. We do NOT
        // auto-inject the brand's harvested product photos: in edit mode every extra
        // input image competes with the chosen product and dilutes its fidelity (and
        // slows the call). The product the client selected/uploaded must be reproduced
        // exactly — it is the one, faithful base. Brand resonance comes from the
        // art-director's text aesthetic, not from competing reference images.
        const references = (body.references ?? []).filter(Boolean);
        const referencesAreBrand = false;
        const MODEL_CHECKLIST = [
          "A real photographed human, not a 3D/CGI/plastic/doll/AI render",
          "Skin has real texture and pores, never waxy or airbrushed",
          "Hands have correct natural fingers; no distortion",
          "Eyes are alive with catchlights; teeth and hair look natural",
          "Anatomy and proportions are correct; believable human asymmetry",
          "NO studio equipment visible — no softbox, light stand, reflector, cables or gear in frame",
          "Clean seamless background to every edge; no text, watermark, caption or border on the image",
        ];

        // Render one shot: regenerate once, plus once more if the QC vision pass rejects it.
        const renderOne = async (idx: number): Promise<void> => {
          const stub = stubs[idx];
          const shot = planned[idx];
          send({ type: "rendering", id: stub.id, angle: shot.angle });
          // Compliance rides with THIS shot — brand do-not + industry + per-shot negatives,
          // stamped on the payload and fed as extra renderer negatives so it holds on every
          // downstream reshoot/edit/resize (not just the first planner prompt).
          const compliance = buildCompliance({ profile, industry, planNegatives: shot.negatives, observedColors: observed?.colors, isModel });
          const extraNegatives = complianceToNegatives(compliance);
          let url: string | null = null;
          let lastErr = "render failed";
          for (let attempt = 0; attempt < 2 && !url; attempt++) {
            try {
              const candidate = isModel
                ? await renderModelShot({ id: stub.id, prompt: shot.prompt, negatives: shot.negatives, extraNegatives, modelRefs, products, references, referencesAreBrand, aspect, imageSize: "2K" })
                : await renderShot({ id: stub.id, prompt: shot.prompt, angle: shot.angle, negatives: shot.negatives, extraNegatives, products, references, referencesAreBrand, aspect, imageSize: "2K" });
              if (attempt === 0) {
                // Per-frame craft + fidelity check. Model mode adds the human-realism bar; product fidelity only when a product is in play.
                const verdict = await qcImage({ url: candidate, checklist: isModel ? MODEL_CHECKLIST : [], brand: profile.name, productRef: products[0] });
                if (!verdict.pass) { send({ type: "qc", id: stub.id, reasons: verdict.reasons }); continue; }
              }
              url = candidate;
            } catch (err) {
              lastErr = (err as Error).message;
            }
          }
          if (url) send({ type: "shot", shot: { id: stub.id, angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives, compliance, url, aspect } });
          else send({ type: "shotError", id: stub.id, angle: shot.angle, error: lastErr });
        };

        // Every shot renders in parallel (pool) for maximum speed.
        const CONCURRENCY = 5;
        const allIdx = stubs.map((_, idx) => idx);
        let cursor = 0;
        const worker = async () => { while (cursor < allIdx.length) { await renderOne(allIdx[cursor++]); } };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allIdx.length) }, worker));
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
