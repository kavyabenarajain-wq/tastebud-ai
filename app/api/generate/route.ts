import type { NextRequest } from "next/server";
import { readSkill, loadIndustryPlaybook } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { artDirect, activeBrain, fallbackPlan, campaignCopy, STANDARD_PRODUCT_ANGLES, DETAIL_SHOTS } from "@/lib/llm";
import { renderShot, renderModelShot, activeRenderer, qcImage, analyzeProduct } from "@/lib/image";
import { reformatImage } from "@/lib/reformat";
import { analyzePlacement } from "@/lib/placement";
import type { ResolvedBrief, BrandProfile, CampaignCopy, CampaignOutput } from "@/lib/types";
import { buildBrief, buildModelBrief, counts, formatToAspect } from "@/lib/brief";
import { brainToProfile } from "@/lib/onboard";
import { buildCompliance, complianceToNegatives } from "@/lib/compliance";
import { CREATIVE_TYPES, FORMATS, carouselDirective, isV2Type, type FormatId } from "@/lib/creativeTypes";
import { saveCampaign, slugify } from "@/lib/brainStore";

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
  // A v2 creative type (instagram / story / carousel / ad) rides the product spine with
  // its own directive, aspect(s), copy and fan-out. Absent → exactly today's behaviour.
  const creative = isV2Type(body.creativeType) ? CREATIVE_TYPES[body.creativeType] : undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const isModel = mode === "model-photoshoot";
        send({ type: "status", phase: "art-direction", brain: activeBrain(), renderer: activeRenderer() });

        const skill = await readSkill(mode);
        const profile: BrandProfile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => ({ id: "none", name: body.brand?.name || "Brand" }));
        let { angles, perAngle, total } = counts(body);
        // Carousel: the sequence length IS the shot count — one frame per swipe, no variations.
        if (creative?.frames) {
          const f = creative.frames;
          angles = Math.max(f.min, Math.min(f.max, body.frames ?? f.def));
          perAngle = 1;
          total = angles;
        }
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
        // The creative type's craft (scroll-stop feed frame, story safe-zones, the
        // carousel narrative arc, the ad's copy space) rides the brief — the planner
        // schema and everything downstream stay unchanged.
        const typeDirective = creative ? (creative.id === "carousel" ? carouselDirective(angles) : creative.directive ?? "") : "";
        const brief =
          `${sceneBrief}\n\n` +
          `SHOT COUNT — produce EXACTLY ${angles} DISTINCT ${isModel ? "frame" : "camera angle"}${angles > 1 ? "s" : ""}, and for EACH ${isModel ? "frame" : "angle"} ${perAngle} shot${perAngle > 1 ? "s" : ""} ` +
          `${perAngle > 1 ? "(variations — slightly different framing, pose, styling or crop)" : ""}. ` +
          `Total ${total} shots. Tag every shot with its ${isModel ? "frame label" : "angle"}. ` +
          `${isModel ? "Keep the SAME person, wardrobe, light and grade across the set so it reads as one coherent shoot." : "Keep light, surface and treatment consistent so the set reads as one shoot."}` +
          angleGuide +
          (typeDirective ? `\n\n${typeDirective}` : "");
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
        const aspect = creative?.aspect ?? formatToAspect(body.panel?.format);

        // Storyboard: hand the client every shot up front so it can show skeleton cards.
        const stamp = Date.now();
        const rand = () => Math.random().toString(36).slice(2, 7);
        // Ad campaigns fan ONE planned concept out across placements — artDirect ran
        // once (the concept), each placement renders natively at its own aspect.
        const fanFormats: FormatId[] = creative?.fanOutFormats
          ? (((body.formats?.length ? body.formats : creative.fanOutFormats) as string[]).filter((f): f is FormatId => f in FORMATS))
          : [];
        type Stub = { id: string; angle: string; aspect: string; format?: FormatId; seq?: number; groupId?: string; planIdx: number };
        const stubs: Stub[] = [];
        planned.forEach((s, idx) => {
          if (fanFormats.length) {
            for (const f of fanFormats) stubs.push({ id: `${stamp}-${idx + 1}-${f}-${rand()}`, angle: s.angle, aspect: FORMATS[f].aspect, format: f, groupId: `g${stamp.toString(36)}-${idx + 1}`, planIdx: idx });
          } else {
            stubs.push({ id: `${stamp}-${idx + 1}-${rand()}`, angle: s.angle, aspect, seq: creative?.frames ? idx + 1 : undefined, groupId: creative?.frames ? `g${stamp.toString(36)}` : undefined, planIdx: idx });
          }
        });

        // A v2 type persists as a CAMPAIGN — the container grouping this brief's
        // sequence / fan-out (campaigns.json, separate from brain.json by design).
        const slug = creative && body.brand?.name ? slugify(body.brand.name) : null;
        const campaignId = slug ? `cmp-${stamp.toString(36)}-${rand()}` : undefined;
        const campaignName = body.campaignName?.trim() || body.express?.trim().slice(0, 64) || creative?.runLabel || "Campaign";
        const outputs: CampaignOutput[] = [];

        send({ type: "plan", angles: plan.angles, count: stubs.length, qc: plan.qc, aspect, creativeType: creative?.id, campaignId, shots: stubs.map((st) => ({ id: st.id, angle: st.angle, aspect: st.aspect, format: st.format, seq: st.seq })) });

        // Copy (headline / CTA / caption) is written in parallel with the renders and
        // streamed as DATA — overlaid in the UI, never baked into the image.
        const copyPromise: Promise<CampaignCopy> = creative?.needsCopy
          ? campaignCopy({ profile, brief: sceneBrief, type: creative.id, frames: creative.frames ? angles : undefined })
              .then((generated) => {
                const copy: CampaignCopy = { ...generated, ...(body.copy ?? {}) }; // the client's own typed copy wins
                if (Object.values(copy).some(Boolean)) send({ type: "copy", copy, campaignId });
                return copy;
              })
              .catch(() => body.copy ?? {})
          : Promise.resolve(body.copy ?? {});

        const products = body.products ?? [];
        const modelRefs = body.modelRefs ?? [];
        // The deterministic finishing grade — keyed to the brand's OWN photos (derived at
        // research time). Applied by sharp AFTER the model so the final colour never comes
        // from the image model and the whole set reads as one photographer. Undefined →
        // renderer falls back to a subtle neutral filmic grade (still off the flat AI look).
        const finish = body.brand?.research?.photoRules?.colorGrade;

        // References are STYLE/look references the client EXPLICITLY added. We do NOT
        // auto-inject the brand's harvested product photos: in edit mode every extra
        // input image competes with the chosen product and dilutes its fidelity (and
        // slows the call). The product the client selected/uploaded must be reproduced
        // exactly — it is the one, faithful base. Brand resonance comes from the
        // art-director's text aesthetic, not from competing reference images.
        // Style references belong ONLY to the plain product / model photoshoots — never
        // to a v2 creative type (instagram / story / carousel / ad), whose look is driven
        // by the brand world + copy, not a pasted reference. Drop them here so a reference
        // left over from an earlier product shoot can't bleed into a campaign render.
        const references = creative ? [] : (body.references ?? []).filter(Boolean);
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
          const shot = planned[stub.planIdx];
          send({ type: "rendering", id: stub.id, angle: shot.angle });
          // Compliance rides with THIS shot — brand do-not + industry + per-shot negatives,
          // stamped on the payload and fed as extra renderer negatives so it holds on every
          // downstream reshoot/edit/resize (not just the first planner prompt).
          const compliance = buildCompliance({ profile, industry, planNegatives: shot.negatives, observedColors: observed?.colors, isModel });
          const extraNegatives = complianceToNegatives(compliance);
          // The generated product MUST match the client's uploaded product exactly. So the
          // fidelity QC runs on EVERY attempt (not just the first) whenever a product is in
          // play — a render that drifts from the upload is never shipped unchecked. We keep
          // retrying up to MAX_ATTEMPTS; only if all fail do we fall back to the last render
          // (best-effort), and then it is flagged unverified rather than passed off as clean.
          const heroRef = (products ?? []).filter(Boolean)[0];
          const gateFidelity = isModel || !!heroRef; // model → human bar; product → match-the-upload
          // 2 attempts: the initial render + one QC-gated reshoot. Both are QC'd (nothing ships
          // blind), but we cap here so a stubborn shot can't triple the render time. Env-tunable.
          const MAX_ATTEMPTS = Math.max(1, Number(process.env.QC_MAX_ATTEMPTS) || 2);
          let url: string | null = null;
          let fallback: string | null = null; // last successful render, used only if every QC fails
          let lastReasons: string[] = [];
          let lastErr = "render failed";
          for (let attempt = 0; attempt < MAX_ATTEMPTS && !url; attempt++) {
            try {
              const candidate = isModel
                ? await renderModelShot({ id: stub.id, prompt: shot.prompt, negatives: shot.negatives, extraNegatives, modelRefs, products, references, referencesAreBrand, aspect: stub.aspect, imageSize: "2K", finish })
                : await renderShot({ id: stub.id, prompt: shot.prompt, angle: shot.angle, negatives: shot.negatives, extraNegatives, products, references, referencesAreBrand, aspect: stub.aspect, imageSize: "2K", finish });
              fallback = candidate;
              if (gateFidelity) {
                // Per-attempt craft + fidelity check. Product mode compares the generated
                // frame against the uploaded product (qcImage's productRef branch); model
                // mode adds the human bar. When a STYLE reference is driving a restage, the
                // product may be re-formed to fit the new scene, so QC judges the fabric /
                // print / colourway (not the folded shape) — else a correct restage fails QC.
                const restage = !isModel && references.length > 0;
                // When the client pasted a likeness reference, QC must verify the generated
                // person IS that individual — not just that it's a clean, realistic human.
                const modelRef = isModel ? modelRefs.filter(Boolean)[0] : undefined;
                const verdict = await qcImage({ url: candidate, checklist: isModel ? MODEL_CHECKLIST : [], brand: profile.name, productRef: heroRef, modelRef, restage });
                if (!verdict.pass) {
                  lastReasons = verdict.reasons;
                  send({ type: "qc", id: stub.id, reasons: verdict.reasons, attempt: attempt + 1, of: MAX_ATTEMPTS });
                  continue;
                }
              }
              url = candidate;
            } catch (err) {
              lastErr = (err as Error).message;
            }
          }
          // Every attempt rendered but none matched the product → ship the last frame rather
          // than dropping the shot, but flag it (reusing the drift badge the ShotCard already
          // renders) so the client sees a "check brand" warning instead of a silent mismatch.
          const drift = !url && !!fallback;
          if (drift) { url = fallback; }
          // Placement sizing — the renderer only emits a few fixed sizes (gpt-image gives
          // 2:3 / 1:1 / 3:2), so a story / feed / landscape placement comes back at the
          // NEAREST size, not its real 9:16 / 4:5 / 16:9. A v2 creative (instagram / story /
          // carousel / ad) must ship the EXACT placement size or the ad platform rejects or
          // crops it — so correct the plate to the declared aspect. reformatImage centre-
          // crops deterministically (the product pixels stay put); best-effort, never drop.
          if (url && creative && stub.aspect) {
            try { url = (await reformatImage({ src: url, targetAspect: stub.aspect })).url; }
            catch { /* keep the uncorrected plate rather than losing the shot */ }
          }
          if (url) {
            send({ type: "shot", shot: { id: stub.id, angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives, compliance, url, aspect: stub.aspect, format: stub.format, seq: stub.seq, groupId: stub.groupId, drift: drift || undefined, driftReasons: drift ? lastReasons : undefined } });
            // Image-aware copy placement: read THIS frame's negative space and stream where its
            // copy should sit, so the set varies placement per shot (the run treatment keeps the
            // voice). Sent AFTER the shot so the image appears immediately; best-effort.
            let placement;
            if (creative?.needsCopy) {
              placement = (await analyzePlacement(url, stub.aspect).catch(() => null)) ?? undefined;
              if (placement) send({ type: "placement", id: stub.id, placement });
            }
            outputs.push({ id: stub.id, url, format: stub.format, aspect: stub.aspect, angle: shot.angle, seq: stub.seq, ...(placement ? { placement } : {}), at: new Date().toISOString() });
          } else send({ type: "shotError", id: stub.id, angle: shot.angle, error: lastErr });
        };

        // Every shot renders in parallel (pool) for maximum speed. Sized so a full
        // six-angle set (and most carousel/fan-out runs) fires in a SINGLE wave rather
        // than 5-then-stragglers — the OpenAI SDK backs off on any 429 so extra lanes are
        // safe. Env-tunable (RENDER_CONCURRENCY) if a provider's rate limit is tighter.
        const CONCURRENCY = Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 8);
        const allIdx = stubs.map((_, idx) => idx);
        let cursor = 0;
        const worker = async () => { while (cursor < allIdx.length) { await renderOne(allIdx[cursor++]); } };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allIdx.length) }, worker));
        // Persist the campaign in ONE write after the pool settles — the parallel
        // workers would otherwise race the read-modify-write on campaigns.json.
        if (creative && slug && campaignId && outputs.length) {
          const copy = await copyPromise;
          const at = new Date().toISOString();
          await saveCampaign(slug, { id: campaignId, name: campaignName, type: creative.id, brief: body.express?.trim() || undefined, copy, outputs, createdAt: at, updatedAt: at }).catch(() => {});
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
