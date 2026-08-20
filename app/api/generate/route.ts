import type { NextRequest } from "next/server";
import { readSkill, loadIndustryPlaybook } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { artDirect, activeBrain, fallbackPlan, campaignCopy, STANDARD_PRODUCT_ANGLES, DETAIL_SHOTS } from "@/lib/llm";
import { renderShot, renderModelShot, activeRenderer, qcImage, qcGroupLikeness, analyzeProduct, analyzeModelRef, modelManifestText, describeReferenceCampaign, describeBrandLook, renderSpeed, styleTransferEnabled } from "@/lib/image";
import { reformatImage } from "@/lib/reformat";
import { enlargeInPlace } from "@/lib/finish";
import { detectCategory, canWear, coerceCategory } from "@/lib/productCategory";
import { analyzePlacement } from "@/lib/placement";
import { compositeRealProduct, productCompositeEnabled } from "@/lib/composite";
import { normHex, defaultBgColor } from "@/lib/copyLayout";
import type { ResolvedBrief, BrandProfile, CampaignCopy, CampaignOutput, CreativeTypeId, ModelPerson, PaletteColor, ReferenceDNA } from "@/lib/types";
import { buildBrief, buildModelBrief, counts, formatToAspect, parsePeopleCount, MAX_IMAGES } from "@/lib/brief";
import { brainToProfile } from "@/lib/onboard";
import { buildCompliance, complianceToNegatives } from "@/lib/compliance";
import { CREATIVE_TYPES, FORMATS, carouselDirective, isV2Type, type FormatId } from "@/lib/creativeTypes";
import { saveCampaign, slugify } from "@/lib/brainStore";
import { ensureGrants, chargeUpTo, chargeRedo, refund, getBalance, recordKill } from "@/lib/store";
import { currentAccount } from "@/lib/supabase/account";
import { retrievePreferences } from "@/lib/memory";
import { recordImage } from "@/lib/store/images"; // per-user gallery record for every delivered shot

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
  // Identity is the VERIFIED Supabase session ONLY (else the shared anonymous bucket). We must NOT
  // trust a client-supplied email here: this account keys the brand-scoped saveCampaign write (and
  // the Meal ledger), so honouring body.account would let an unauthenticated caller inject campaigns
  // into another tenant's brand and spend their Meals. Middleware already 401s a signed-out request
  // to this route; currentAccount() is the belt-and-suspenders that keeps a client claim from ever
  // becoming a write key even on the fail-open auth-blip path.
  const account = await currentAccount();
  const mode = body.mode === "model-photoshoot" ? "model-photoshoot" : "product-photoshoot";
  // A v2 creative type (instagram / story / carousel / ad) rides the product spine with
  // its own directive, aspect(s), copy and fan-out. Absent → exactly today's behaviour.
  const creative: CreativeSpec = isV2Type(body.creativeType) ? CREATIVE_TYPES[body.creativeType] : undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        // Land the free-trial grant + this month's plan grant before any charge (idempotent, race-safe).
        await ensureGrants(account).catch(() => {});
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
        // The SELECTED products in full (name + ALL images + facts). Used to lock product identity,
        // hand the model front+back panels, and enrich the on-pack manifest. Absent (uploads) →
        // fall back to the flat image-URL list, i.e. exactly today's behaviour.
        const productInfo = (body.productInfo ?? []).filter(Boolean);
        // Product image refs handed to the model: ONE hero image per selected product (the front).
        // We deliberately do NOT feed multiple faces of one product to the renderer — gpt-image can
        // double a product from two input images. Falls back to body.products (uploads) when no
        // catalog info came through — i.e. exactly today's behaviour.
        const singleProduct = productInfo.length === 1 && (productInfo[0].images ?? []).filter(Boolean).length > 0;
        const products = productInfo.length
          ? productInfo.map((p) => (p.images ?? []).filter(Boolean)[0]).filter(Boolean)
          : (body.products ?? []).filter(Boolean);
        const heroProduct = products[0];
        const noProduct = !heroProduct; // no real product → render brand-generic (never invent one)
        // Vision pre-pass: LOOK at the real product and read BOTH its packaging COLOURS and a full
        // MANIFEST of everything printed on it — so the scene keys to the real colour, the model
        // reproduces the exact product, and nothing on the pack is dropped. For a single product we
        // read its front + back panels (multiple images) so the manifest covers text on EVERY face,
        // even though only the front image drives the render.
        const inspectImages = singleProduct ? productInfo[0].images.filter(Boolean).slice(0, 2) : products.slice(0, 1);
        const inspection = noProduct ? null : await analyzeProduct(inspectImages).catch(() => null);
        const observed = inspection; // colour/material consumers below are unchanged
        if (observed?.colors.length) send({ type: "status", phase: "product-colour", colors: observed.colors });
        // Product IDENTITY (stops a different product being rendered) + on-pack MANIFEST (forces every
        // real element to appear, legibly) — merging what the CAMERA saw with KNOWN catalog facts.
        const heroInfo = productInfo[0];
        const idParts: string[] = [];
        if (heroInfo?.name) idParts.push(`"${heroInfo.name}"`);
        if (heroInfo?.category) idParts.push(`a ${heroInfo.category}`);
        if (heroInfo?.variants?.length) idParts.push(`variant/option: ${heroInfo.variants.slice(0, 4).join(" / ")}`);
        if (inspection?.identity) idParts.push(inspection.identity);
        const productIdentity = idParts.length ? idParts.join(" — ") : undefined;
        const productManifest = inspection?.elements?.length ? inspection.elements.join("; ") : undefined;
        if (productManifest) send({ type: "status", phase: "product-manifest", count: inspection!.elements!.length });
        // BRAND-LOOK pre-pass: read HOW this brand shoots off their OWN feed photos, at gen time, on
        // the funded vision client — so the renderer applies their real photographic signature
        // directly (the researched rulebook only ever reached the planner as prose before). Kicked
        // off now so its latency hides behind the planner; awaited per-run in the render loop.
        const brandPhotos = (body.brand?.research?.productImages ?? []).filter(Boolean);
        const brandLookPromise: Promise<string | null> = brandPhotos.length ? describeBrandLook(brandPhotos.slice(0, 4)).catch(() => null) : Promise.resolve(null);
        // Brand memory — the "sharper every campaign" loop, compacted for the planner. Augmented
        // with taste RECALLED from the external memory layer (this brand + cross-brand founder taste,
        // scoped to the signed-in account, keyed to this scene). This is what finally populates the
        // planner's learned-preferences from real founder history. No-op / instant when unkeyed.
        const compact = compactMemory(body.brand);
        const memSlug = body.brand?.name ? slugify(body.brand.name) : null;
        const recalledPrefs = await retrievePreferences(account, memSlug, sceneBrief).catch(() => []);
        const memory = compact || recalledPrefs.length
          ? {
              approved: compact?.approved ?? [],
              rejected: compact?.rejected ?? [],
              preferences: Array.from(new Set([...(compact?.preferences ?? []), ...recalledPrefs])).slice(0, 8),
            }
          : undefined;
        if (memory) send({ type: "status", phase: "memory", approved: memory.approved.length, rejected: memory.rejected.length });
        const modelRefs = body.modelRefs ?? [];
        // INTERACTION context — can a human WEAR it, and is it food/drink (appetite prose)? Brand +
        // scene text, exactly as before. This only tunes prose/wardrobe, never the hard object-class
        // lock below, so the scene brief here is benign.
        const modelCategory = detectCategory(body.brand?.category, body.brand?.productType, body.brand?.name, body.express);
        const productWearable = canWear(modelCategory);
        // Food/drink products get the appetite-appeal freshness directive on the render (same seam
        // as wearable). Gated so non-food products are unaffected.
        const appetiteCategory = modelCategory === "food" || modelCategory === "drink";
        // OBJECT-CLASS LOCK category — the class that hard-locks the render + QC (clothing stays
        // clothing, never a bottle/cup). Derived ONLY from the ACTUAL product image (per the
        // identity-from-product-images rule). The vision read wins; an inconclusive / "general" read
        // or no product → "general" = NO lock (fail-open). Brand text and the scene brief NEVER drive
        // it: a prop word ("on a marble table") must not relabel a serum as furniture, and a fashion
        // brand can still ship a bottle. (This is the fix for the review's category-poisoning findings.)
        const visionCategory = coerceCategory(inspection?.category);
        const lockCategory = visionCategory && visionCategory !== "general" ? visionCategory : "general";
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
        // whose look is driven by the brand world + copy. We distil the reference(s) into a reusable
        // CAMPAIGN DNA (the reference fix): the planner designs a VARIED, brand-rooted set in that
        // vibe, and the renderer applies it as a per-shot style layer — never one cloned scene.
        // Kicked off NOW (multi-image) so its latency hides behind analyzeProduct + the planner.
        const primaryReferences = creative ? [] : (body.references ?? []).filter(Boolean);
        const refDNAPromise: Promise<ReferenceDNA | null> = primaryReferences.length
          ? describeReferenceCampaign(primaryReferences.slice(0, 4)).catch(() => null)
          : Promise.resolve(null);
        // FORENSIC LIKENESS + FLAW READ — when the client pasted ONE reference person, read their
        // exact face and EVERY real mark/flaw so the renderer reproduces THEM (flaws visible, never
        // beautified). Kicked off here so its latency hides behind analyzeProduct + the planner; a
        // group (per-person locks already) and built models (no reference) don't need it.
        const singleModelRef = isModel && !isGroup ? modelRefs.filter(Boolean)[0] : undefined;
        const modelInspectPromise = singleModelRef
          ? analyzeModelRef(singleModelRef).catch(() => null)
          : Promise.resolve(null);
        const MODEL_CHECKLIST = [
          "A real photographed human, not a 3D/CGI/plastic/doll/AI render",
          "Skin has real texture, pores and natural imperfections — never smoothed, airbrushed, evened-out or beautified",
          "Vivid, bright and well-graded — rich contrast, deep blacks, luminous highlights; never flat, hazy, muddy or washed-out",
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
          // REFERENCE CAMPAIGN — a reference is a request for a full campaign, not one match. When the
          // client attached a reference and did NOT explicitly ask for a shot count, default the plain
          // primary run to a full varied set (MAX_IMAGES shots) so they get "6–7 angles in the vibe"
          // instead of a single frame. An explicit numAngles>1 (or a v2 type) always wins.
          if (isPrimary && !spec && primaryReferences.length > 0 && (body.panel?.numAngles ?? 1) <= 1) {
            angles = MAX_IMAGES;
            perAngle = 1;
            total = MAX_IMAGES;
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

          // The client reference's reusable CAMPAIGN DNA (the reference fix). Resolved BEFORE the
          // planner so it becomes the art-direction spine: the planner designs a VARIED, brand-rooted
          // set in this vibe. It then rides the render as a per-shot STYLE LAYER (below). A v2
          // companion never carries a reference. Awaits the shared promise (hidden behind the pre-passes).
          const refDNA = spec ? null : await refDNAPromise;
          // The reference person's likeness + flaw manifest (single-reference model shoots only),
          // resolved once and passed to every frame so each render reproduces THEM, flaws visible.
          const modelManifest = modelManifestText(await modelInspectPromise);
          let plan;
          try {
            plan = await artDirect({ skill, profile, brief, industry, productColors: observed?.colors, productMaterial: observed?.material, forModel: isModel, memory, referenceDNA: refDNA ?? undefined });
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
          // MEALS — charge up front for this run's planned images (1 Meal = 1 delivered image),
          // mirroring the imageBudget clamp: a short balance CLAMPS the set instead of failing it.
          // One ledger write per run (runs are sequential), never from the concurrent render
          // workers below — so QC retries are free by construction and the ledger can't race.
          // Undelivered shots are refunded in the finally-reconciliation after the pool drains.
          //
          // SATISFACTION REDO — a redo/refine of one already-paid shot rides this same route with
          // `redo:true`. The FIRST FREE_REDOS_PER_SHOT redos of a shot are free; beyond that a redo
          // charges like a normal image (chargeRedo counts prior redos of this shot off the ledger —
          // no client counter needed). `redoWasFree` is remembered so the finally only refunds a redo
          // that was actually charged. Changing the ENTIRE thing is a normal run and charges as usual.
          const isRedo = body.redo === true;
          let redoWasFree = false;
          let paid: { granted: number; balance: number };
          if (isRedo) {
            const shotKey = heroProduct || `${runKey}:${stamp.toString(36)}`; // the redone shot's url is the key
            const r = await chargeRedo(account, shotKey).catch(() => ({ free: true, granted: stubs.length, balance: 0 }));
            redoWasFree = r.free;
            paid = { granted: r.free ? stubs.length : r.granted, balance: r.balance };
          } else {
            paid = await chargeUpTo(account, stubs.length, `shoot:${runKey}:${stamp.toString(36)}`).catch(() => ({ granted: stubs.length, balance: 0 }));
          }
          if (paid.granted < stubs.length) {
            send({ type: "meals", event: "clamped", wanted: stubs.length, granted: paid.granted, balance: paid.balance });
            imageBudget += stubs.length - paid.granted; // return the unshot budget to later runs
            stubs.length = paid.granted;
          }
          if (!stubs.length) { send({ type: "plan", run: runKey, angles: [], count: 0, qc: [], aspect, creativeType: spec?.id, shots: [] }); return; }

          // A v2 type persists as a CAMPAIGN — the container grouping this brief's sequence /
          // fan-out (campaigns.json, separate from brain.json by design).
          const slug = spec && body.brand?.name ? slugify(body.brand.name) : null;
          const campaignId = slug ? `cmp-${stamp.toString(36)}-${runKey}-${rand()}` : undefined;
          const campaignName = (isPrimary && body.campaignName?.trim()) || body.express?.trim().slice(0, 64) || spec?.runLabel || "Campaign";
          const outputs: CampaignOutput[] = [];

          try {
          send({ type: "plan", run: runKey, angles: plan.angles, count: stubs.length, qc: plan.qc, aspect, creativeType: spec?.id, campaignId, shots: stubs.map((st) => ({ id: st.id, angle: st.angle, aspect: st.aspect, format: st.format, seq: st.seq })) });

          // Attach the client reference IMAGES only for the OPEN-SOURCE style-transfer path; on the
          // live OpenAI path the vibe rides as WORDS (gpt-image clones a 2nd image or ignores it, and
          // can double the reference's product). Falls back to the brand's OWN feed photos as a LOOK
          // reference when the client gave none (product stays pixel-locked; only the world is borrowed).
          const attachClientRefs = !!refDNA && !spec && styleTransferEnabled();
          const usingBrandRefs = !isModel && !spec && primaryReferences.length === 0 && brandPhotos.length > 0;
          const references = spec ? [] : (attachClientRefs ? primaryReferences.slice(0, 3) : (usingBrandRefs ? brandPhotos.slice(0, 2) : []));
          const referencesAreBrand = usingBrandRefs;
          if (refDNA && isPrimary) send({ type: "status", phase: "reference", matched: true });
          // How this brand shoots (words), applied to the render. This now rides ALONGSIDE a client
          // reference too (not only when there's none): the reference owns composition/set/light, the
          // brand owns grade/palette/styling — which is what "my product in this reference, in MY
          // brand style" actually means. renderShot scopes the block to grade/styling on a restage.
          // Now applies to MODEL shoots too (not only product) — the brand's photographic signature
          // should reach on-model pixels as well; only a v2-campaign companion is excluded (its look
          // is driven by the brand world + copy). renderModelShot scopes the block to set/light/grade/
          // styling and never copies the brand's product or faces.
          const brandLook = !spec ? await brandLookPromise : null;
          if (referencesAreBrand && isPrimary) send({ type: "status", phase: "brand-look", matched: true });

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
            // A QC failure RE-RENDERS the shot — a second full render on the hot path, the biggest
            // single source of latency variance. In fast mode we cap at ONE render: the shot ships
            // immediately (flagged if it drifts) instead of paying for a retry. Balanced/quality keep
            // the retry. An explicit QC_MAX_ATTEMPTS still overrides.
            const MAX_ATTEMPTS = Math.max(1, Number(process.env.QC_MAX_ATTEMPTS) || (renderSpeed() === "fast" ? 1 : 2));
            // QC GATE (default OFF): when on, a shot that fails the vision judge on EVERY attempt is
            // DROPPED instead of shipped with a soft "drift" badge — so the objective failure classes
            // (wrong product / drift / text-on-product / wrong person) never reach the founder. The
            // Meal is refunded by the finally-reconciliation, exactly like any other undelivered shot.
            const qcGate = process.env.QC_GATE === "1";
            // CATEGORY GATE — fail-CLOSED on object-class drift: a clothing product rendered as a
            // bottle/cup is regenerated, then DROPPED if still wrong, even when the soft QC gate is
            // off. Default OFF in code (prod-live safety); set CATEGORY_GATE=1 to enforce (local .env
            // ships it on). Category misses are high-precision, so false drops are rare.
            const categoryGate = process.env.CATEGORY_GATE === "1";
            let url: string | null = null;
            let fallback: string | null = null;
            let lastReasons: string[] = [];
            let categoryDrift = false; // last failing verdict was specifically an object-class miss
            let lastErr = "render failed";
            // A restage/campaign-vibe shot deliberately renders at LOW fidelity so the camera can move;
            // escalating it would re-clone the reference. Every OTHER shot (plain hero, macro, on-model)
            // that fails QC gets its RESHOOT bumped to HIGH input_fidelity — so the retry can actually
            // fix product/label/likeness drift instead of re-rolling at the same fidelity that caused it.
            const isRestageShot = !isModel && references.length > 0 && !referencesAreBrand && !refDNA;
            const retryFidelity = (attempt: number): "high" | undefined => (attempt > 0 && !isRestageShot ? "high" : undefined);
            for (let attempt = 0; attempt < MAX_ATTEMPTS && !url; attempt++) {
              try {
                const candidate = isModel
                  ? await renderModelShot({ id: stub.id, prompt: shot.prompt, negatives: shot.negatives, extraNegatives, modelRefs, modelManifest: modelManifest ?? undefined, people: modelPeople, groupCount: isGroup ? groupModels.length : undefined, products, productIdentity, productManifest, category: lockCategory, references, referencesAreBrand, refDNA: refDNA ?? undefined, brandLook: brandLook ?? undefined, wearable: productWearable, aspect: stub.aspect, imageSize: "2K", inputFidelity: retryFidelity(attempt), finish })
                  // cleanPlate: this creative's headline/CTA are overlaid later as real typography,
                  // so the RENDER must carry no text of its own — otherwise the model bakes the
                  // headline into the set and the overlay prints it again on top.
                  : await renderShot({ id: stub.id, prompt: shot.prompt, angle: shot.angle, negatives: shot.negatives, extraNegatives, products, references, referencesAreBrand, refDNA: refDNA ?? undefined, productIdentity, productManifest, category: lockCategory, brandLook: brandLook ?? undefined, noProduct, cleanPlate: !!spec?.needsCopy, appetite: appetiteCategory, aspect: stub.aspect, imageSize: "2K", inputFidelity: retryFidelity(attempt), finish });
                fallback = candidate;
                if (gateFidelity) {
                  // Restage QC is LENIENT (allows re-forming). Brand-OWN photos and a campaign-vibe
                  // reference both keep the product PIXEL-LOCKED (only the world/grade changes), so they
                  // QC STRICTLY — a restage only applies to the legacy literal-restage image path.
                  const restage = !isModel && references.length > 0 && !referencesAreBrand && !refDNA;
                  // A group frame has several faces; comparing the whole shot to ONE reference
                  // would false-fail people 2..N. Skip the single-identity gate for groups —
                  // per-person likeness is enforced by the prompt lock + negatives instead.
                  const modelRef = isModel && !isGroup ? modelRefs.filter(Boolean)[0] : undefined;
                  const verdict = await qcImage({ url: candidate, checklist: isModel ? MODEL_CHECKLIST : [], brand: profile.name, productRef: heroRef, modelRef, restage, manifest: inspection?.elements, cleanPlate: !!spec?.needsCopy, category: lockCategory });
                  // A group frame skips the single-identity gate above — so run a dedicated per-person
                  // roster check (all N references vs the group shot) to catch a blended/duplicated/
                  // missing/mismatched face, which nothing else verifies. Fail-open, best-effort.
                  const groupVerdict = isGroup && modelPeople ? await qcGroupLikeness({ url: candidate, people: modelPeople, brand: profile.name }) : { pass: true, reasons: [] as string[] };
                  if (!verdict.pass || !groupVerdict.pass) {
                    lastReasons = [...verdict.reasons, ...groupVerdict.reasons];
                    categoryDrift = verdict.categoryOk === false; // remember whether THIS miss was a category miss
                    send({ type: "qc", id: stub.id, reasons: lastReasons, attempt: attempt + 1, of: MAX_ATTEMPTS });
                    continue;
                  }
                }
                url = candidate;
              } catch (err) {
                lastErr = (err as Error).message;
              }
            }
            const drift = !url && !!fallback; // rendered, but failed QC on every attempt
            // A CATEGORY miss is fail-closed when the category gate is on: never restore the fallback,
            // so a wrong-object-class shot (clothing shown as a bottle) is DROPPED, not shipped flagged.
            const dropForCategory = drift && categoryDrift && categoryGate;
            if (drift && !qcGate && !dropForCategory) { url = fallback; } // legacy: ship the near-miss flagged; gate ON (or a category miss) drops it
            if (drift) {
              // The machine's rejection is training data too — log WHY the QC judge killed it, whether
              // the gate dropped the shot or shipped it flagged. Best-effort; never blocks the shoot.
              void recordKill({
                account,
                slug: body.brand?.name ? slugify(body.brand.name) : null,
                decision: "qc-reject",
                reason: lastReasons.join("; ") || undefined,
                failedBar: isModel ? "model" : "product",
                shot: { id: stub.id, url: fallback ?? "", angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives, mode: isModel ? "model-photoshoot" : "product-photoshoot", decision: "reject", at: new Date().toISOString() },
              }).catch(() => {});
            }
            if (url && spec && stub.aspect) {
              try { url = (await reformatImage({ src: url, targetAspect: stub.aspect })).url; }
              catch { /* keep the uncorrected plate rather than losing the shot */ }
            }
            if (url) {
              // GUARANTEE FIDELITY (flag PRODUCT_COMPOSITE, off by default): drop the client's REAL
              // product cutout onto the rendered scene so the hero pixels ARE their product. Product
              // shoots with a hero upload only; best-effort — a failure returns the render unchanged.
              const base: string = url; // const so the non-null narrowing holds inside the catch closure
              const finalUrl = !isModel && heroRef && productCompositeEnabled()
                ? await compositeRealProduct({ renderUrl: base, productSrc: heroRef }).catch(() => base)
                : base;
              // Always-on free 4K: enlarge + re-sharpen the accepted plate IN PLACE (same url, no
              // second render) BEFORE the url is exposed to the client — so the very first fetch, the
              // grid thumbnail and the keeper download all serve the ~4K bytes. (Enlarging AFTER the
              // send lets the browser/CDN cache the 2K first-fetch under Blob's immutable cache-control,
              // masking the in-place overwrite — the download would then serve stale 2K.) The lanczos
              // pass is deterministic + local (~a few seconds, parallel across the pool). Real
              // super-resolution stays the opt-in keeper upgrade (/api/upscale).
              await enlargeInPlace(finalUrl, undefined, finish?.sharpen);
              send({ type: "shot", run: runKey, shot: { id: stub.id, angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives, compliance, url: finalUrl, aspect: stub.aspect, format: stub.format, seq: stub.seq, groupId: stub.groupId, drift: drift || undefined, driftReasons: drift ? lastReasons : undefined, brandGeneric: noProduct || undefined } });
              const output: CampaignOutput = { id: stub.id, url: finalUrl, format: stub.format, aspect: stub.aspect, angle: shot.angle, seq: stub.seq, at: new Date().toISOString() };
              outputs.push(output);
              // Persist this delivered image under the signed-in account — the durable "my images"
              // record (the public Blob object carries no owner). Fire-and-forget; never delays the shoot.
              void recordImage({
                account,
                url: finalUrl,
                kind: isModel ? "model" : spec ? "campaign" : "product",
                slug: body.brand?.name ? slugify(body.brand.name) : null,
                prompt: shot.prompt,
              }).catch(() => {});
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
            } else send({
              type: "shotError", id: stub.id, angle: shot.angle,
              error: dropForCategory
                ? "Rendered as the wrong kind of product (category mismatch) — dropped"
                : drift ? "Couldn't match your product closely enough — dropped by QC" : lastErr,
              reasons: drift ? lastReasons : undefined, qcDropped: drift || undefined,
            });
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
            await saveCampaign(slug, { id: campaignId, name: campaignName, type: spec.id, brief: body.express?.trim() || undefined, copy, outputs, createdAt: at, updatedAt: at }, account).catch(() => {});
          }
          } finally {
            // MEALS reconciliation — refund every paid-for image that was never delivered
            // (shotError, thrown worker, client abort closing the stream). You pay per plated
            // dish, never per attempt in the kitchen. A free redo charged nothing, so there is
            // nothing to refund — skip it, or we'd CREDIT Meals that were never spent. A PAID redo
            // (beyond the free allowance) IS charged, so it reconciles like a normal run; only a FREE
            // redo is skipped.
            const undelivered = paid.granted - outputs.length;
            const chargedRun = !isRedo || !redoWasFree;
            if (chargedRun && undelivered > 0) await refund(account, undelivered, `refund:shoot:${runKey}`).catch(() => {});
          }
        };

        // Primary run first (today's behaviour), then each companion — sequentially so the render
        // pools don't collectively blow a provider's rate limit. Shared pre-passes are never repeated.
        await runOne(creative, "primary");
        for (const t of companionTypes) await runOne(CREATIVE_TYPES[t], t);
        // Live balance so the pill updates without a refetch.
        await getBalance(account).then((balance) => send({ type: "meals", event: "balance", balance })).catch(() => {});
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
