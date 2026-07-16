import type { NextRequest } from "next/server";
import { readSkill, loadIndustryPlaybook } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { artDirect, activeBrain, fallbackPlan, campaignCopy, STANDARD_PRODUCT_ANGLES, DETAIL_SHOTS } from "@/lib/llm";
import { renderShot, renderModelShot, activeRenderer, qcImage, analyzeProduct, describeReferenceScene } from "@/lib/image";
import { reformatImage } from "@/lib/reformat";
import { enlargeInPlace } from "@/lib/finish";
import { detectCategory, canWear } from "@/lib/productCategory";
import { analyzePlacement } from "@/lib/placement";
import { normHex, defaultBgColor } from "@/lib/copyLayout";
import type { ResolvedBrief, BrandProfile, CampaignCopy, CampaignOutput, CreativeTypeId, ModelPerson, PaletteColor } from "@/lib/types";
import { buildBrief, buildModelBrief, counts, formatToAspect, parsePeopleCount, MAX_IMAGES } from "@/lib/brief";
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

/**
 * Keep the copy's colour treatment INSIDE the brand: normalise the layout agent's bgColor /
 * inkColor to a real hex, defaulting a colour-background to the palette's primary — so a
 * brand-colour band/canvas never bakes as a wrong or fallback-black fill in the export.
 */
function sanitizeCopyColors(copy: CampaignCopy, palette?: PaletteColor[]): CampaignCopy {
  const t = copy.treatment;
  if (!t) return copy;
  const next = { ...t };
  if (t.bg && t.bg !== "scrim") next.bgColor = normHex(t.bgColor) ?? defaultBgColor(palette) ?? "#141414";
  else delete next.bgColor;
  if (t.inkColor) { const ink = normHex(t.inkColor); if (ink) next.inkColor = ink; else delete next.inkColor; }
  return { ...copy, treatment: next };
}

type CreativeSpec = (typeof CREATIVE_TYPES)[CreativeTypeId] | undefined;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResolvedBrief;
  const mode = body.mode === "model-photoshoot" ? "model-photoshoot" : "product-photoshoot";
  // A v2 creative type (instagram / story / carousel / ad) rides the product spine with
  // its own directive, aspect(s), copy and fan-out. Absent → exactly today's behaviour.
  const creative: CreativeSpec = isV2Type(body.creativeType) ? CREATIVE_TYPES[body.creativeType] : undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const isModel = mode === "model-photoshoot";
        // ── GROUP SHOOT resolution — the fix for "3–4 models in one shoot". A cast of 2+ people
        //    can come from the UI toggle (explicit `models` with reference photos) OR simply from
        //    the client asking ("three models", "me and two friends"). Resolve it BEFORE the brief
        //    so the whole pipeline (brief → planner → renderer) knows it's a group. Runs before any
        //    single-model default so a group ask always wins.
        if (isModel) {
          const explicit = (body.models ?? []).filter(Boolean);
          if (explicit.length >= 2) {
            body.models = explicit.slice(0, 4);
          } else {
            const n = parsePeopleCount(body.express);
            if (n >= 2) body.models = Array.from({ length: n }, (_, i): ModelPerson => ({ source: "build", name: `Person ${i + 1}` }));
          }
        }
        send({ type: "status", phase: "art-direction", brain: activeBrain(), renderer: activeRenderer() });

        // ══ SHARED PRE-PASSES — computed ONCE and reused by the primary run AND any companions.
        //    This is what makes "a product shoot that ALSO makes stories/posts" fast: the
        //    expensive brand load, product-colour vision pass, industry lookup, memory compaction
        //    and reference description all run a SINGLE time for the whole bundle. ═══════════════
        const skill = await readSkill(mode);
        const profile: BrandProfile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => ({ id: "none", name: body.brand?.name || "Brand" }));
        const sceneBrief = isModel ? buildModelBrief(body) : buildBrief(body);
        // Route to the product's INDUSTRY PLAYBOOK (perfume → fragrance.md, etc.) and inject it
        // for real — the master skill only NAMES the playbooks; the planner needs the actual text.
        const rb = (profile.rulebook ?? {}) as Record<string, unknown>;
        const routeText = [
          body.brand?.category, body.brand?.productType, body.brand?.name,
          rb.category, rb.productType, rb.aesthetic, profile.name,
          body.express, sceneBrief,
        ].filter((v) => typeof v === "string").join(" \n ");
        const industry = await loadIndustryPlaybook(routeText).catch(() => null);
        if (industry) send({ type: "status", phase: "industry", playbook: industry.label });
        // Vision pre-pass: LOOK at the uploaded product so the (otherwise blind) art director can
        // key the scene to the real packaging colour. Serial before the plan (its colours feed it).
        const heroProduct = (body.products ?? []).filter(Boolean)[0];
        const observed = !heroProduct ? null : await analyzeProduct(heroProduct).catch(() => null);
        if (observed?.colors.length) send({ type: "status", phase: "product-colour", colors: observed.colors });
        // Brand memory — the "sharper every campaign" loop, compacted for the planner.
        const memory = compactMemory(body.brand);
        if (memory) send({ type: "status", phase: "memory", approved: memory.approved.length, rejected: memory.rejected.length });
        const products = body.products ?? [];
        const modelRefs = body.modelRefs ?? [];
        // Product category → whether a human can genuinely WEAR it. Non-wearables (food,
        // drink, furniture, an object) tell the renderer to suppress wardrobe prose and ban
        // "worn" so a model is never made to wear an ice cream or a sofa.
        const modelCategory = detectCategory(body.brand?.category, body.brand?.productType, body.brand?.name, body.express);
        const productWearable = canWear(modelCategory);
        // Multi-model: 2+ DISTINCT people in one frame. `renderPeople` carries only the people
        // who have a reference photo (used to build the per-person identity lock); `isGroup`
        // also covers built-attribute groups so the single-identity QC doesn't false-fail them.
        const groupModels = (body.models ?? []).filter(Boolean);
        const isGroup = groupModels.length >= 2;
        const renderPeople = groupModels.map((m) => ({ name: m.name, refs: (m.refs ?? []).filter(Boolean) })).filter((pp) => pp.refs.length);
        const modelPeople = renderPeople.length >= 2 ? renderPeople : undefined;
        // The deterministic finishing grade — keyed to the brand's OWN photos (derived at research
        // time), applied by sharp AFTER the model so the final colour never comes from the model.
        const finish = body.brand?.research?.photoRules?.colorGrade;
        // Style references are the client's EXPLICIT look references. They belong ONLY to a plain
        // product/model shoot (the primary run when it is not a v2 type) — never to a v2 companion,
        // whose look is driven by the brand world + copy. Kick describeReferenceScene off NOW so its
        // 3–6s hides entirely behind analyzeProduct + the planner instead of serializing after them.
        const primaryReferences = creative ? [] : (body.references ?? []).filter(Boolean);
        const referencesAreBrand = false;
        const refScenePromise: Promise<string | null> = primaryReferences.length
          ? describeReferenceScene(primaryReferences[0]).catch(() => null)
          : Promise.resolve(null);
        const MODEL_CHECKLIST = [
          "A real photographed human, not a 3D/CGI/plastic/doll/AI render",
          "Skin has real texture and pores, never waxy or airbrushed",
          "Hands have correct natural fingers; no distortion",
          "Eyes are alive with catchlights; teeth and hair look natural",
          "Anatomy and proportions are correct; believable human asymmetry",
          "NO studio equipment visible — no softbox, light stand, reflector, cables or gear in frame",
          "Clean seamless background to every edge; no text, watermark, caption or border on the image",
        ];

        const stamp = Date.now();
        const rand = () => Math.random().toString(36).slice(2, 7);

        // Companion v2 types to ALSO produce from this one action (a product shoot that also
        // yields Instagram stories + posts). De-duped, v2-only, minus the primary type. Only on
        // the product spine — a model shoot doesn't auto-spawn campaigns. Empty → today's behaviour.
        const companionTypes: CreativeTypeId[] = isModel
          ? []
          : ([...new Set((body.companions ?? []).filter(isV2Type))] as CreativeTypeId[]).filter((t) => t !== body.creativeType);

        // The whole request's image budget — the primary run spends first, companions get what's
        // left, and nothing may push the request over MAX_IMAGES total. Enforced when stubs are built.
        let imageBudget = MAX_IMAGES;

        // One request → the primary run + each companion, each with its OWN plan / copy / campaign,
        // all sharing the pre-passes above. Tagged with `run` so the client stacks a card per run.
        const runOne = async (spec: CreativeSpec, runKey: string): Promise<void> => {
          const isPrimary = runKey === "primary";
          let { angles, perAngle, total } = counts(body);
          // A companion gets its own small set — the product panel's counts belong to the product
          // shoot, not to the story/post. Stories/posts → 3 distinct options; an ad → 1 concept fanned.
          if (!isPrimary) {
            if (spec?.id === "story" || spec?.id === "instagram") { angles = 3; perAngle = 1; total = 3; }
            else { angles = 1; perAngle = 1; total = 1; }
          }
          // Carousel: the sequence length IS the shot count — one frame per swipe, no variations.
          if (spec?.frames) {
            const f = spec.frames;
            angles = Math.max(f.min, Math.min(f.max, body.frames ?? f.def));
            perAngle = 1;
            total = angles;
          }
          // Product angle direction: the STANDARD angles guarantee camera VARIETY across the set,
          // a coverage backbone (not a rigid catalogue). The art director leads with editorial taste.
          const angleGuide = isModel
            ? ""
            : `\n\nCAMERA VARIETY — this is the #1 requirement: the ${angles} shot${angles > 1 ? "s" : ""} MUST look like GENUINELY DIFFERENT camera angles, never the same front view with a different background or shadow. Keep exactly ONE clean straight-on eye-level hero for fidelity; EVERY OTHER shot must use DRAMATICALLY different geometry drawn from: ${STANDARD_PRODUCT_ANGLES.slice(0, 8).map((a, i) => `${i + 1}) ${a}`).join("; ")}. ` +
              `HARD RULE for a ${angles}-shot set: include at LEAST one true TOP-DOWN / flat-lay (product laid flat, shot from directly above), at least one SIDE profile or LOW/HIGH angle, and at least one MACRO detail — and do NOT use more than one near-front / three-quarter-frontal view. Spread the dramatic angles across the set; never cluster similar frontal shots. ` +
              `It is a CREATIVE shoot, not a catalogue: pair each angle with an editorial TASTE treatment (see the taste library). For detail / texture coverage, draw from the DETAIL SHOTS: ${DETAIL_SHOTS.join(", ")}. Tag every shot with its explicit angle label (e.g. "Top-down flat-lay", "Low angle", "Side profile") so the renderer can move the camera.`;
          // The creative type's craft (scroll-stop feed frame, story safe-zones, the carousel arc,
          // the ad's copy space) rides the brief — the planner schema stays unchanged.
          const typeDirective = spec ? (spec.id === "carousel" ? carouselDirective(angles) : spec.directive ?? "") : "";
          // A SET of parallel posts/stories must not look templated: each option is its OWN shoot,
          // with its clean negative space in a DIFFERENT region so the overlaid copy never repeats
          // its position and never sits on the product. Pairs with the N distinct copy variants.
          const setDirective =
            spec && (spec.id === "story" || spec.id === "instagram") && angles > 1
              ? `\n\nTHIS IS A SET OF ${angles} SEPARATE ${spec.id === "story" ? "STORIES" : "POSTS"} — NOT ONE SHOT REPEATED. Make each option a genuinely different creative: a different scene / setting, a different composition and camera move, and a different product moment, so no two look like recolours of each other. CRUCIAL for the copy: give each option a LARGE clean area of negative space, and put that empty area in a DIFFERENT part of the frame across the set (e.g. option 1 leaves the TOP open, option 2 the BOTTOM, option 3 one SIDE) — the product must sit clear of that empty region so the headline never overlaps it.`
              : "";
          const brief =
            `${sceneBrief}\n\n` +
            `SHOT COUNT — produce EXACTLY ${angles} DISTINCT ${isModel ? "frame" : "camera angle"}${angles > 1 ? "s" : ""}, and for EACH ${isModel ? "frame" : "angle"} ${perAngle} shot${perAngle > 1 ? "s" : ""} ` +
            `${perAngle > 1 ? "(variations — slightly different framing, pose, styling or crop)" : ""}. ` +
            `Total ${total} shots. Tag every shot with its ${isModel ? "frame label" : "angle"}. ` +
            `${isModel ? (isGroup ? `THIS IS A GROUP SHOOT — every frame shows the SAME cast of ${groupModels.length} distinct people together (never a solo portrait, never fewer), with consistent wardrobe, light and grade across the set.` : "Keep the SAME person, wardrobe, light and grade across the set so it reads as one coherent shoot.") : "Keep light, surface and treatment consistent so the set reads as one shoot."}` +
            angleGuide +
            (typeDirective ? `\n\n${typeDirective}` : "") +
            setDirective;

          let plan;
          try {
            plan = await artDirect({ skill, profile, brief, industry, productColors: observed?.colors, productMaterial: observed?.material, forModel: isModel, memory });
          } catch {
            // Brain unreachable → deterministic plan so the shoot still renders.
            plan = fallbackPlan(sceneBrief, angles, perAngle, mode);
          }
          const planned = plan.shots.slice(0, total);
          const aspect = spec?.aspect ?? formatToAspect(body.panel?.format);

          // Ad campaigns fan ONE planned concept out across placements — artDirect ran once
          // (the concept), each placement renders natively at its own aspect.
          const fanFormats: FormatId[] = spec?.fanOutFormats
            ? (((body.formats?.length ? body.formats : spec.fanOutFormats) as string[]).filter((f): f is FormatId => f in FORMATS))
            : [];
          type Stub = { id: string; angle: string; aspect: string; format?: FormatId; seq?: number; groupId?: string; planIdx: number };
          const stubs: Stub[] = [];
          const runStamp = `${stamp}${runKey === "primary" ? "" : `-${runKey}`}`;
          planned.forEach((s, idx) => {
            if (fanFormats.length) {
              for (const f of fanFormats) stubs.push({ id: `${runStamp}-${idx + 1}-${f}-${rand()}`, angle: s.angle, aspect: FORMATS[f].aspect, format: f, groupId: `g${stamp.toString(36)}-${runKey}-${idx + 1}`, planIdx: idx });
            } else {
              stubs.push({ id: `${runStamp}-${idx + 1}-${rand()}`, angle: s.angle, aspect, seq: spec?.frames ? idx + 1 : undefined, groupId: spec?.frames ? `g${stamp.toString(36)}-${runKey}` : undefined, planIdx: idx });
            }
          });
          // HARD CAP — the single authoritative guard. No request may EVER emit more than MAX_IMAGES
          // images across all its runs (product set, story/post set, carousel frames, ad fan-out and
          // any companions), whatever counts a (possibly hand-crafted) request asks for. Clamp this
          // run to the remaining budget and spend it; a run left with nothing simply produces nothing.
          if (stubs.length > imageBudget) stubs.length = Math.max(0, imageBudget);
          imageBudget -= stubs.length;
          if (!stubs.length) { send({ type: "plan", run: runKey, angles: [], count: 0, qc: [], aspect, creativeType: spec?.id, shots: [] }); return; }

          // A v2 type persists as a CAMPAIGN — the container grouping this brief's sequence /
          // fan-out (campaigns.json, separate from brain.json by design).
          const slug = spec && body.brand?.name ? slugify(body.brand.name) : null;
          const campaignId = slug ? `cmp-${stamp.toString(36)}-${runKey}-${rand()}` : undefined;
          const campaignName = (isPrimary && body.campaignName?.trim()) || body.express?.trim().slice(0, 64) || spec?.runLabel || "Campaign";
          const outputs: CampaignOutput[] = [];

          send({ type: "plan", run: runKey, angles: plan.angles, count: stubs.length, qc: plan.qc, aspect, creativeType: spec?.id, campaignId, shots: stubs.map((st) => ({ id: st.id, angle: st.angle, aspect: st.aspect, format: st.format, seq: st.seq })) });

          // Style references + the described reference scene apply only to a plain product/model
          // primary run (v2 companions force references=[]). refScene resolves from the promise
          // kicked off in the shared block, so it's already hidden behind the planner.
          const references = spec ? [] : primaryReferences;
          const refScene = spec ? null : await refScenePromise;
          if (refScene && isPrimary) send({ type: "status", phase: "reference", matched: true });

          // Copy (headline / CTA / caption), written in parallel with the renders and streamed as
          // DATA — overlaid in the UI, never baked. A multi-option story/post run gets N DISTINCT
          // variants so the words never repeat. The client's typed copy only overrides the primary.
          const copyVariants = (spec?.id === "story" || spec?.id === "instagram") && angles > 1 ? angles : undefined;
          const typedCopy = isPrimary ? body.copy ?? {} : {};
          const copyPromise: Promise<CampaignCopy> = spec?.needsCopy
            ? campaignCopy({ profile, brief: sceneBrief, type: spec.id, frames: spec.frames ? angles : undefined, variants: copyVariants })
                .then((generated) => {
                  const copy: CampaignCopy = sanitizeCopyColors({ ...generated, ...typedCopy }, profile.palette);
                  if (Object.values(copy).some(Boolean)) send({ type: "copy", run: runKey, copy, campaignId });
                  return copy;
                })
                .catch(() => typedCopy)
            : Promise.resolve(typedCopy);

          // Best-effort copy-placement jobs run OFF the render lane (they only produce an overlay
          // hint) so they never hold a pool worker or delay the next shot; awaited once before save.
          const placementJobs: Promise<void>[] = [];

          // Render one shot: regenerate once, plus once more if the QC vision pass rejects it.
          const renderOne = async (idx: number): Promise<void> => {
            const stub = stubs[idx];
            const shot = planned[stub.planIdx];
            send({ type: "rendering", id: stub.id, angle: shot.angle });
            const compliance = buildCompliance({ profile, industry, planNegatives: shot.negatives, observedColors: observed?.colors, isModel });
            const extraNegatives = complianceToNegatives(compliance);
            const heroRef = (products ?? []).filter(Boolean)[0];
            const gateFidelity = isModel || !!heroRef; // model → human bar; product → match-the-upload
            const MAX_ATTEMPTS = Math.max(1, Number(process.env.QC_MAX_ATTEMPTS) || 2);
            let url: string | null = null;
            let fallback: string | null = null;
            let lastReasons: string[] = [];
            let lastErr = "render failed";
            for (let attempt = 0; attempt < MAX_ATTEMPTS && !url; attempt++) {
              try {
                const candidate = isModel
                  ? await renderModelShot({ id: stub.id, prompt: shot.prompt, negatives: shot.negatives, extraNegatives, modelRefs, people: modelPeople, groupCount: isGroup ? groupModels.length : undefined, products, references, referencesAreBrand, wearable: productWearable, aspect: stub.aspect, imageSize: "2K", finish })
                  : await renderShot({ id: stub.id, prompt: shot.prompt, angle: shot.angle, negatives: shot.negatives, extraNegatives, products, references, referencesAreBrand, refScene: refScene ?? undefined, aspect: stub.aspect, imageSize: "2K", finish });
                fallback = candidate;
                if (gateFidelity) {
                  const restage = !isModel && references.length > 0;
                  // A group frame has several faces; comparing the whole shot to ONE reference
                  // would false-fail people 2..N. Skip the single-identity gate for groups —
                  // per-person likeness is enforced by the prompt lock + negatives instead.
                  const modelRef = isModel && !isGroup ? modelRefs.filter(Boolean)[0] : undefined;
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
            const drift = !url && !!fallback;
            if (drift) { url = fallback; }
            if (url && spec && stub.aspect) {
              try { url = (await reformatImage({ src: url, targetAspect: stub.aspect })).url; }
              catch { /* keep the uncorrected plate rather than losing the shot */ }
            }
            if (url) {
              const finalUrl = url;
              // Always-on free 4K: enlarge + re-sharpen the accepted plate in place so the
              // downloadable original and every derived thumbnail are crisp at ~4K. Real
              // super-resolution stays the opt-in keeper upgrade (/api/upscale).
              await enlargeInPlace(finalUrl);
              send({ type: "shot", run: runKey, shot: { id: stub.id, angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives, compliance, url: finalUrl, aspect: stub.aspect, format: stub.format, seq: stub.seq, groupId: stub.groupId, drift: drift || undefined, driftReasons: drift ? lastReasons : undefined } });
              const output: CampaignOutput = { id: stub.id, url: finalUrl, format: stub.format, aspect: stub.aspect, angle: shot.angle, seq: stub.seq, at: new Date().toISOString() };
              outputs.push(output);
              // Image-aware copy placement runs OFF the render lane — the shot pixels are already
              // shown; this only decides WHERE the overlay copy sits (clear of the product), and it
              // writes the hint back onto the saved output. Detached so it never delays the next shot.
              if (spec?.needsCopy) {
                placementJobs.push(
                  analyzePlacement(finalUrl, stub.aspect).catch(() => null).then((placement) => {
                    if (placement) { output.placement = placement; send({ type: "placement", id: stub.id, placement }); }
                  })
                );
              }
            } else send({ type: "shotError", id: stub.id, angle: shot.angle, error: lastErr });
          };

          // Every shot renders in parallel (pool). The OpenAI SDK backs off on any 429 so extra
          // lanes are safe. Env-tunable (RENDER_CONCURRENCY) if a provider's rate limit is tighter.
          const CONCURRENCY = Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 8);
          const allIdx = stubs.map((_, idx) => idx);
          let cursor = 0;
          const worker = async () => { while (cursor < allIdx.length) { await renderOne(allIdx[cursor++]); } };
          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allIdx.length) }, worker));
          // Let the detached placement passes finish so the persisted outputs carry their hints.
          await Promise.all(placementJobs);
          if (spec && slug && campaignId && outputs.length) {
            const copy = await copyPromise;
            const at = new Date().toISOString();
            await saveCampaign(slug, { id: campaignId, name: campaignName, type: spec.id, brief: body.express?.trim() || undefined, copy, outputs, createdAt: at, updatedAt: at }).catch(() => {});
          }
        };

        // Primary run first (today's behaviour), then each companion — sequentially so the render
        // pools don't collectively blow a provider's rate limit. Shared pre-passes are never repeated.
        await runOne(creative, "primary");
        for (const t of companionTypes) await runOne(CREATIVE_TYPES[t], t);
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
