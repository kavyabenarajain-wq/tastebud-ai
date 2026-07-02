import { z } from "zod";
import type { BrandProfile, ShootPlan } from "./types";
import { chatCreate } from "./openaiClient";

/**
 * The art-director brain. Reads the skill + Brand Profile + resolved brief and
 * returns the shot plan (angles, per-shot photographer prompts, QC checklist).
 *
 * Provider-swappable: uses Anthropic claude-sonnet-4-6 when ANTHROPIC_API_KEY is
 * set (spec); otherwise Azure OpenAI (gpt-5.5). The image model never sees this —
 * the skill governs THIS call; this call governs the image prompts.
 */

const PlanSchema = z.object({
  angles: z.array(z.string()).default([]),
  shots: z
    .array(
      z.object({
        angle: z.string(),
        prompt: z.string(),
        negatives: z.array(z.string()).optional().default([]),
      })
    )
    .min(1),
  qc: z.array(z.string()).optional().default([]),
});

export function activeBrain(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet-4-6";
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_MODEL ?? "gpt-5.5";
  return process.env.AZURE_OPENAI_DEPLOYMENT ?? "azure-openai";
}

// The canonical STANDARD product angles as a COVERAGE LADDER: ordered so the first N
// give the most VARIED set possible (different elevations + distances, not just
// rotations around the product). "N angles" = the first N of these — so 6 angles
// yields front, three-quarter, overhead, side, low-hero and macro, never six look-alikes.
export const STANDARD_PRODUCT_ANGLES = [
  "Front, straight-on, eye level", // 1 — the hero
  "45° front-left three-quarter", // 2 — dimension & form
  "Top-down (90° flat-lay)", // 3 — directly overhead
  "Side profile (left)", // 4 — pure side
  "Low angle, looking up", // 5 — dramatic, looking up at the product
  "Macro close-up", // 6 — tight detail / texture
  "High angle, looking down", // 7 — looking down onto it
  "45° front-right three-quarter", // 8
  "Back", // 9
  "Bottom / base", // 10 — underside
  "45° rear three-quarter", // 11
  "Side profile (right)", // 12
  "Extreme macro (texture / detail)", // 13
  "Eye level", // 14
];

// EDITORIAL TASTE LIBRARY — the *treatments* that separate a campaign image from a
// catalogue packshot, distilled from real top-tier brand/food/beauty/apparel shoots
// (Aesop / Poppi / Olipop / Kinfolk / Glossier-tier feeds). The art director picks a
// treatment per shot to MATCH THE BRAND'S WORLD — never applies all of them, never
// uses one that fights the brand. These describe the *scene & energy*, not the camera
// geometry in STANDARD_PRODUCT_ANGLES; a strong set pairs a treatment with an angle.
export const TASTE_LIBRARY = [
  "HAND-HELD INTERACTION — a real human hand (correct anatomy) holding, gripping, squeezing, pouring, presenting or using the product; or the product tucked in a back jean pocket, cradled in fingers with condensation, mid-pour. Human energy, not a sterile object on a table.",
  "BOLD COLOUR-BLOCK — the product on ONE saturated seamless backdrop (cobalt, tomato red, hot pink, marigold, olive, lilac) with a single hard or soft directional shadow; props, if any, tonal within that hue. Confident, graphic, modern-brand.",
  "IN-CONTEXT RITUAL — the product where it is actually lived with: bathroom shelf, open fridge, picnic blanket, car dashboard/mirror, gym bag, beach towel, kitchen counter, bedside — candid, real-life, talent optional.",
  "INGREDIENT FLAT-LAY — top-down on a real surface, the product surrounded by its true ingredients (fresh fruit, coffee beans, herbs, ice, flowers) and a few curated objects, with intentional negative space.",
  "PLAYFUL / SURREAL PLACEMENT — the product in a witty unexpected vessel or staging: nested in a coconut, a mesh produce bag of oranges, an ice bucket, on a chessboard, peeking from shipping boxes, balanced in a still-life stack. Art-directed, never random clutter.",
  "SUN / FLASH EDITORIAL — hard midday sun or direct on-camera flash against open sky, a painted wall or tile; deep crisp shadows, punchy colour, 35mm grain; or warm low golden-hour glow. Has attitude and a time-of-day.",
  "GROUPED RANGE STILL-LIFE — the full line-up clustered or stacked as a sculptural still life on a coloured sweep, considered heights and overlap; for multi-SKU or family shots.",
  "MACRO SUBSTANCE — tight on the product's substance and material: the pour, drip, swatch, cream texture, foam, fizz, condensation beads — sensorial and tactile.",
];

// DETAIL shots — the close, descriptive coverage. Used for detail-focused requests.
export const DETAIL_SHOTS = [
  "Material / fabric texture",
  "Stitching",
  "Branding / logo",
  "Labels & tags",
  "Buttons / zippers / clasps",
  "Edges",
  "Corners",
  "Open / closed mechanism",
  "Packaging details",
  "Interior details",
];

const ANGLE_POOL = STANDARD_PRODUCT_ANGLES;

const MODEL_ANGLE_POOL = [
  "Full-length / wide — the whole look in the environment",
  "Three-quarter, waist up — the workhorse editorial frame, model plus product",
  "Beauty close-up portrait — face, skin and expression",
  "Product-interaction detail — hands holding, applying or wearing the product",
  "Profile / turned — dimension and movement",
  "Lifestyle / in-motion — a natural, candid brand moment",
];

/** Deterministic plan when the brain (Azure/Claude) is unreachable — keeps generation working. */
export function fallbackPlan(sceneBrief: string, angles: number, perAngle: number, mode: "product-photoshoot" | "model-photoshoot" = "product-photoshoot"): ShootPlan {
  const pool = mode === "model-photoshoot" ? MODEL_ANGLE_POOL : ANGLE_POOL;
  const chosen = pool.slice(0, Math.max(1, Math.min(pool.length, angles)));
  const shots = [];
  for (const a of chosen) for (let i = 0; i < perAngle; i++) shots.push({ angle: a, prompt: `${a}. ${sceneBrief}`, negatives: [] });
  return { angles: chosen, shots, qc: [] };
}

function stripFences(t: string): string {
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const i = t.indexOf("{");
  return i >= 0 ? t.slice(i, t.lastIndexOf("}") + 1) : t;
}

async function viaOpenAI(system: string, user: string): Promise<string> {
  const r = await chatCreate({
    max_completion_tokens: 8000, // gpt-5.5 is a reasoning model; leave room for reasoning + the JSON
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
}

async function viaAnthropic(system: string, user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const j: any = await r.json();
  if (j.error) throw new Error(`Anthropic error: ${j.error.message}`);
  return j.content?.[0]?.text ?? "";
}

const QuestionsSchema = z.object({ questions: z.array(z.string()).max(5).default([]) });

function chat(system: string, user: string): Promise<string> {
  return process.env.ANTHROPIC_API_KEY ? viaAnthropic(system, user) : viaOpenAI(system, user);
}

/**
 * Generic completion for other internal tools (e.g. the back-brain deck builder).
 * `reasoningEffort` (gpt-5.x reasoning models) caps internal reasoning so the token
 * budget goes to the actual output — critical for large JSON that would otherwise truncate.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 8000,
  opts: { reasoningEffort?: "minimal" | "low" | "medium" | "high" } = {}
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return viaAnthropic(system, user);
  const body: Record<string, unknown> = {
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
  try {
    const r = await chatCreate(body as any);
    return r.choices[0]?.message?.content ?? "";
  } catch (e) {
    // Some deployments reject reasoning_effort — retry once without it.
    if (opts.reasoningEffort) {
      delete body.reasoning_effort;
      const r = await chatCreate(body as any);
      return r.choices[0]?.message?.content ?? "";
    }
    throw e;
  }
}

/** Pull the first JSON object/array out of a model reply (handles fences + prose). */
export function extractJson(t: string): string {
  return stripFences(t);
}

/** Intake: read the brief + brand and ask the few questions that most change the shoot. */
export async function askQuestions(args: { skill: string; profile: BrandProfile; brief: string }): Promise<string[]> {
  const system = `${args.skill}\n\n---\nACTIVE BRAND PROFILE (JSON):\n${JSON.stringify(args.profile)}`;
  const user =
    `The client's brief so far:\n${args.brief}\n\n` +
    `You are the art director doing a fast intake BEFORE the shoot. Ask 2–4 SHARP, specific questions that would most change the result — the surface/background and scene, the product's contents/substance and how it behaves (pour, drip, condensation, fill level), the light and mood, the composition/crop, and where it will run (format). Only ask what is genuinely unspecified and high-impact; never ask what the brief or Brand Profile already answers. One plain line each, no preamble.\n\n` +
    `Return STRICT JSON ONLY: {"questions":["...","..."]}`;
  try {
    return QuestionsSchema.parse(JSON.parse(stripFences(await chat(system, user)))).questions;
  } catch {
    return [];
  }
}

/**
 * Foreground HOW this brand actually shoots — its researched photography signature —
 * as a readable dossier the planner must study, instead of burying it in a JSON blob.
 */
function brandLookDossier(p: BrandProfile): { text: string; hasSignature: boolean } {
  const rb = (p.rulebook ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []);
  const palette = (p.palette ?? []).map((c) => [c.hex, c.name && `(${c.name})`].filter(Boolean).join(" ")).join(", ");
  const aesthetic = s(rb.aesthetic);
  const summary = s(rb.summary);
  const hasSignature = Boolean(aesthetic || summary);

  const L: string[] = [`Brand: ${p.name}`];
  if (s(rb.essence) || p.positioning) L.push(`Positioning: ${s(rb.essence) || p.positioning}`);
  if (p.audience) L.push(`Audience: ${p.audience}`);
  const cat = [s(rb.category), s(rb.productType)].filter(Boolean).join(" — ");
  if (cat) L.push(`Category / products: ${cat}`);
  if (s(rb.vibe)) L.push(`Vibe: ${s(rb.vibe)}`);
  if (palette) L.push(`Palette (use these exact colours): ${palette}`);
  if (aesthetic) L.push(`★ PHOTOGRAPHY SIGNATURE — how THIS brand actually shoots; REPRODUCE it (backgrounds, surfaces, colour grade, styling density, lighting, crops, model-or-product): ${aesthetic}`);
  if (summary) L.push(`Visual identity: ${summary}`);
  const products = list(rb.products);
  if (products.length) L.push(`Their product line-up (real catalogue, scraped from their site): ${products.slice(0, 40).join(", ")}`);
  const comp = list(rb.competitors);
  if (comp.length) L.push(`Brands they sit beside (their visual neighbourhood): ${comp.join(", ")}`);
  const found = [s(rb.website), s(rb.instagram)].filter(Boolean).join("  ·  ");
  if (found) L.push(`Feeds: ${found}`);
  if (p.doNot?.length) L.push(`Do-not (hard): ${p.doNot.join("; ")}`);

  const header = hasSignature
    ? `STUDY THIS BRAND BEFORE PLANNING — it has an established, RESEARCHED look you must reproduce, not reinvent:`
    : `What is known about this brand (fill every blank from it; lean on the industry playbook for category taste):`;
  return { text: `${header}\n${L.join("\n")}`, hasSignature };
}

export async function artDirect(args: {
  skill: string;
  profile: BrandProfile;
  brief: string;
  industry?: { label: string; content: string } | null;
  productColors?: { name: string; hex: string; role: string }[];
  productMaterial?: string;
  forModel?: boolean;
  memory?: { approved: string[]; rejected: string[]; preferences?: string[] };
}): Promise<ShootPlan> {
  const look = brandLookDossier(args.profile);
  // Brand memory — a SOFT steer learned from shoots the founder kept / rejected. Ranked
  // strictly beneath product fidelity, the do-not list, and the client's ★ request.
  const mem = args.memory;
  const memoryBlock = mem && (mem.approved.length || mem.rejected.length || (mem.preferences?.length ?? 0))
    ? `\n\n---\nTHIS BRAND'S LEARNED TASTE — from past shoots the founder KEPT or REJECTED. Treat it as a SOFT DEFAULT for anything the client did NOT explicitly direct; it NEVER overrides product fidelity, the do-not list, or the client's own-words (★) request.\n` +
      (mem.approved.length ? `LEAN TOWARD (kept / hero): ${mem.approved.join("; ")}.\n` : "") +
      (mem.rejected.length ? `AVOID REPEATING (rejected): ${mem.rejected.join("; ")}.\n` : "") +
      (mem.preferences?.length ? `Noted preferences: ${mem.preferences.join("; ")}.\n` : "")
    : "";
  // The planner never sees the product image (it must not invent the product's form),
  // but a vision pre-pass DID look at it and report the packaging colours. Feed those
  // in so "match the product" can key the scene palette to the real colour.
  const pc = (args.productColors ?? []).filter((c) => c.name || c.hex);
  const primary = pc[0];
  const productColorBlock = pc.length
    ? `\n\n---\nOBSERVED PRODUCT COLOURS — a vision pass LOOKED at the actual uploaded packaging and read these colours (primary first): ${pc.map((c) => [c.name, c.hex, c.role && `[${c.role}]`].filter(Boolean).join(" ")).join(", ")}.${args.productMaterial ? ` Material/finish: ${args.productMaterial}.` : ""} These are the REAL product's colours.\n` +
      `COLOUR HARMONY IS MANDATORY (this is the #1 fix — past shoots clashed): the scene palette MUST be built in deliberate harmony with the product's OWN packaging colour${primary ? ` — above all its PRIMARY colour ${[primary.name, primary.hex].filter(Boolean).join(" ")}` : ""}. By DEFAULT — and ESPECIALLY on the first / hero shot — key the surface, background, props and colour grade to that primary colour: a considered complementary, a deeper or lighter tone, or a clean colour-block of it — WITH CLEAR TONAL CONTRAST so the product visibly SEPARATES and POPS off the background. NEVER a same-tone monochrome where the product melts into the ground (a beige product on a beige sweep, a charcoal product on a charcoal sweep) — harmony is a designed, high-contrast relationship, not camouflage. If the product itself is PALE, NEUTRAL or MONOCHROME, do NOT sit it on its own pale tone — ground it on a DEEPER, CONTRASTING colour drawn from the BRAND PALETTE (e.g. a sand/beige sneaker on a deep charcoal, burgundy, indigo or espresso ground), or in a real textured environment, so it reads with real punch. NEVER put the product on a background that garishly clashes with its packaging colour. The product's colour leads the scene's colour; the brand palette and mood refine WITHIN that harmony, never against it. Only break from the product's colour world if the client's panel explicitly names a different background/surface. Never recolour the product itself — only build the scene around these colours.`
    : "";
  const industryBlock = args.industry
    ? (args.forModel
        ? `\n\n---\nINDUSTRY PLAYBOOK — ${args.industry.label} (category CONTEXT for a MODEL shoot). Use it for the category's palette/surface logic, substance behaviour, colour world, mood and do-not list, and to keep the product true to its category. The model-photoshoot skill above GOVERNS the framing, posing, wardrobe and human realism — do NOT switch to product-only packshot archetypes from this playbook; adapt its taste to a shoot with a person. Never overrides the realism bar, brand-lock, or the brand's do-not list.\n${args.industry.content}`
        : `\n\n---\nINDUSTRY PLAYBOOK — ${args.industry.label}. This product is in this category, so this playbook is LAW for the shoot: use its shot archetypes, palette/surface logic, substance focus and category do-not list. It OVERRIDES the master skill's generic defaults, but NEVER overrides the realism bar, brand-lock, or the brand's do-not list. Combine it with the brand's own photography signature above — the playbook is the category's craft, the signature is THIS brand's specific take on it.\n${args.industry.content}`)
    : "";
  const system =
    `${args.skill}${industryBlock}\n\n---\n${look.text}${productColorBlock}${memoryBlock}\n\n---\n` +
    `(Full Brand Profile JSON, for any field not spelled out above — the floor for every blank; never violate the do-not list:\n${JSON.stringify(args.profile)})`;
  // Product photoshoot = product-only. Humans belong in the Model photoshoot.
  const productOnlyBlock = args.forModel
    ? ""
    : `PRODUCT-ONLY SHOOT — NO HUMANS OF ANY KIND (this is a PRODUCT photoshoot, not a model shoot): do NOT put a person, model, hand, fingers, arm, leg, foot or ANY body part in ANY frame. The product is the sole subject in every shot. Editorial energy comes from the ENVIRONMENT, surface, light, colour, angle and composition — NEVER from a human presence or a hand holding/wearing the product. If a taste treatment implies a person (e.g. "hand-held interaction" or a "ritual"), ADAPT it to a product-only still-life — the product placed, propped, leaning, standing or staged in its scene — never actually held, worn or touched by a hand. The ONLY exception is if the client's own-words request (★) explicitly asks for a hand or person.\n\n`;
  const user =
    `Client brief (resolved from the panel, the express prompt, and the client's answers to your intake questions):\n${args.brief}\n\n` +
    `PRIORITY OF DIRECTION — obey in THIS order and never invert it:\n` +
    `  1) PRODUCT FIDELITY (reproduce the real product exactly) and the brand's DO-NOT list are absolute.\n` +
    `  2) THE CLIENT'S OWN-WORDS REQUEST (marked ★ in the brief above, if present) is the HIGHEST creative authority. If the client asked for a specific scene, setting, place, mood, colour, prop, story or idea, DELIVER EXACTLY THAT — even when it departs from the brand's usual signature. Read their words literally and build precisely what they described; do not swap it for the brand's default look. If they named a setting (e.g. a beach, a kitchen, a street), the shot happens THERE.\n` +
    `  3) The brand's photography signature and palette fill EVERY blank the client did NOT direct. It is the default, never an override of an explicit request.\n` +
    `  4) THIS BRAND'S LEARNED TASTE (above, if present) is a SOFT default BENEATH 1–3: for anything the client did not direct, lean toward what was kept/hero and away from what was rejected — but never let it override product fidelity, the do-not list, or the client's ★ request.\n` +
    `Whatever the client wrote, it MUST be clearly visible in the resulting shots. Failing to reflect their request is the worst possible outcome.\n\n` +
    `Act as a WORLD-CLASS commercial photographer and art director with real taste — the level of a Kinfolk / Aesop / top-fashion-house campaign. Make every shot genuinely creative, considered and editorial — a campaign image, never a flat boring catalogue packshot.\n\n` +
    `STEP 1 — STUDY THE BRAND BEFORE YOU PRODUCE ANYTHING (mandatory). Before planning a single shot, study two things and state your read in the first angle's reasoning: (a) HOW THIS BRAND ACTUALLY SHOOTS — the PHOTOGRAPHY SIGNATURE in the brand dossier above (their real backgrounds, surfaces, palette, colour grade, styling density, lighting quality and direction, crops, and whether they shoot product-only or with models/hands/lifestyle); and (b) the INDUSTRY PLAYBOOK for this product's category — if one is provided above, it is LAW (its shot archetypes, palette/surface logic, substance focus and category do-not list). ${look.hasSignature ? "This brand has a researched, established look — MATCH and elevate it for everything the client did NOT explicitly ask for: their real surfaces, colour world, light, styling density and crop habits are your DEFAULT. BUT where the client's own-words request (★) asks for something different, the client's request WINS — build exactly what they asked and apply the brand's craft, quality and palette WITHIN their idea, rather than overriding their idea with the brand's usual set." : "This brand has no strong researched signature yet — derive the taste from the INDUSTRY PLAYBOOK for its category and the palette/vibe above, so it reads like the category's best work."} Only after this study do you design the set.\n` +
    `STEP 2 — CREATIVE DIRECTION: from that study, infer the brand's specific WORLD and design the whole set FROM IT so the result could ONLY belong to this brand. Choose ONE strong, specific art-direction concept and commit to it: a real, intentional environment with genuine depth, real materials and texture, considered layering and negative space, and light that belongs to the concept and to the brand's signature. A creative director should feel THIS brand's point of view, not a default template. The renderer is also shown the brand's real published photos as a look reference, so write each prompt to echo that same photographic world. Elevate within their language; never override it with a generic studio aesthetic.\n` +
    `ANTI-AI-CLICHÉ (hard ban on every shot unless the panel literally asks for it): NO generic gradient-void background, NO subject floating on a pedestal / podium / plinth, NO concentric spotlight halo, NO random scattered geometric cubes or pebbles, NO fake confetti bokeh, NO plastic CGI-render staging, NO arbitrary swirling fabric. Real photographed sets only, with real-world physics and depth.\n` +
    `CAMPAIGN-GRADE, NOT A CATALOGUE PACKSHOT — this is the #1 quality bar and the thing to fix. The default output MUST be an EDITORIAL CAMPAIGN image with a real point of view — the kind of frame that runs in a brand's actual campaign — NOT a lone product floating on a plain gradient sweep. LEAD FROM THE BRAND'S REAL PHOTOGRAPHY SIGNATURE above: where the brand shoots in lived-in / in-context / street / lifestyle / cultural environments, PLACE THE PRODUCT IN A REAL, BELIEVABLE SETTING with genuine depth, atmosphere, real surfaces and a sense of story that belongs to THEIR world (for a streetwear/street-culture brand: real concrete, brick, tiled floors, stairwells, shopfronts, textured walls, urban nooks — shot like a photographer was really there); where the brand is genuinely studio-minimalist, build a considered STUDIO SET with a strong concept — intentional colour, shape, gel or paper, real texture and sculpted light — never a flat, characterless gradient. A PRODUCT-ONLY shot does NOT need a person to be in-context: stage the product as a still-life IN a real place — resting on concrete or stone steps, a tiled / terrazzo floor, a painted-wall ledge, a market or shopfront surface, weathered wood, a car bonnet — with real environmental texture, grounding contact shadow and directional daylight, so it feels shot on location rather than in a void. Commit to ONE strong art-direction idea per shot and give the product real PRESENCE, contrast and scale in the frame. Avoid BOTH failure modes: (a) a cheap, cluttered set with random scattered props, AND — the one to fix here — (b) a bland, generic, low-contrast product-on-a-gradient e-commerce packshot with no concept. The HERO / first shot MUST be the striking, art-directed, in-context or high-concept campaign frame — NOT the safe studio one; when only ONE shot is requested, it MUST be that campaign frame, never a plain product-on-neutral-sweep. Even when the brand shoots SOME clean studio, LEAD with their most campaign-worthy, lived-in / in-context register; reserve a clean straight-on studio shot for at most ONE secondary coverage frame in a larger set, never the hero. Do NOT reflexively reach for a marble/stone/wood "premium surface" trope either — the concept comes from the brand's real world. BUT IF the client explicitly chose a background/surface in the panel (e.g. "Match the product", "Pure white", "Pure black", a named colour) OR named a specific setting in their request, OBEY THAT EXACTLY — do NOT invent an environment over an explicit background choice; "Match the product" in particular means a clean, whole-frame colour-matched studio sweep, product only.\n\n` +
    `${productOnlyBlock}` +
    `EDITORIAL TASTE LIBRARY — these are the *treatments* that make real campaign work (not catalogue packshots). For each shot, pick the ONE treatment that best fits THIS brand's world and vary treatments across the set; pair each with a camera angle. Never apply a treatment that fights the brand, and never use a treatment the panel contradicts:\n${TASTE_LIBRARY.map((t, i) => `  ${i + 1}) ${t}`).join("\n")}\nDefault instinct: lead the set with treatments that carry a strong concept — a real lived-in environment / in-context staging, bold colour-block, or sun/flash editorial — rather than an isolated object on a plain sweep, UNLESS the brand is explicitly minimalist/clinical${args.forModel ? " (or the shoot centres a model)" : " (and PRODUCT MODE stays product-only — adapt any 'hand-held' treatment to a product-only still-life, never a real hand or person)"}. Keep at least one clean, straight-on hero in the set for fidelity.\n\n` +
    `Decide the angle list, then write a full photographer's brief for EACH shot. NON-NEGOTIABLE:\n` +
    `• PRODUCT FIDELITY: You have NOT seen the product's FORM and must NOT invent it. NEVER describe, restyle, reshape, recolour, relabel or name the product's form or design — always refer to it as "the product exactly as in the reference image". Describe ONLY the scene around it. Never turn the product into a different object. (Its packaging COLOURS, however, ARE known — see OBSERVED PRODUCT COLOURS above — and you SHOULD build the scene's palette around them when matching the product.)\n` +
    `• OBEY THE PANEL LITERALLY: the client's panel choices in the brief above (background, surface, vibe, lighting, composition, format) are hard instructions — follow each one EXACTLY, do not substitute your own taste. Only fill genuinely blank fields from the Brand Profile.\n` +
    `• CAMERA-FIRST: OPEN each shot's prompt by describing HOW it was photographed, before the scene. Name a specific real camera body and lens matched to the frame (e.g. Canon EOS R5 or Sony A7 IV with an 85mm f/1.4 for a close/three-quarter portrait, a 35–50mm prime for full-length, or an iPhone 16 Pro for a candid lifestyle moment) shot wide open (≈f/1.8–f/2.8) for a genuinely shallow depth of field, plus a film/colour treatment (e.g. Kodak Portra 400 / Fujifilm Pro 400H) — gentle highlight roll-off, true skin tones, fine grain, NO digital over-sharpening or HDR. REAL PHOTOGRAPHY, never a 3D/CGI/plastic render; true material behaviour, a real contact shadow.\n` +
    `• MOTIVATED LIGHT + NATURAL IMPERFECTION: describe the light as a real physical environment (soft overcast window light, low golden-hour sun, one soft directional source), never flat even light. For people, bake in subtle natural imperfections — a few flyaway hairs, real skin pores and texture, faint expression lines, a relaxed unposed posture and a candid expression, slight asymmetry — so they never look airbrushed, filtered or doll-like.\n` +
    `• CLEAN FRAME — describe light ONLY by its EFFECT on the subject and set (direction, softness, falloff, warmth). NEVER name or place any physical light, softbox, light panel, lamp, stand, reflector, umbrella, tripod, cable or studio equipment — none of it may be visible in the frame. The background is clean to every edge.\n` +
    `• WARDROBE (when a model wears/holds an apparel product): the model wears THAT exact garment in its anatomically correct position — trousers/jeans at the waist and hips covering the legs, a top on the torso, a dress full-length — tailored to fit the model's real body with natural drape, as part of a COMPLETE, brand-appropriate outfit (style suitable complementary pieces, e.g. a simple top with trousers). Never stretch one garment over the whole body, never strapless-wrap a bottom garment, never leave the model partly or oddly dressed, never paste the garment on as a flat cut-out.\n` +
    `• Genuinely DIFFERENT compositions and angles across the set (eye-level hero, low hero, three-quarter, overhead, macro) — not near-duplicates; art-direct the crop and negative space per shot.\n` +
    `• Per-shot negative list. Brand-locked throughout.\n\n` +
    `Also return the reject-and-regenerate QC checklist.\n\n` +
    `Return STRICT JSON ONLY, no prose, no markdown fences:\n` +
    `{"angles":["..."],"shots":[{"angle":"...","prompt":"...","negatives":["..."]}],"qc":["..."]}`;

  const ask = (u: string) => chat(system, u);
  const tryParse = (raw: string): ShootPlan | null => {
    try {
      const cleaned = stripFences(raw ?? "");
      if (!cleaned.trim()) return null;
      return PlanSchema.parse(JSON.parse(cleaned));
    } catch {
      return null;
    }
  };

  let raw = await ask(user);
  let plan = tryParse(raw);
  if (!plan) {
    // Retry once, demanding compact complete JSON only (handles empty/truncated replies).
    raw = await ask(user + "\n\nYour previous reply was not valid, complete JSON. Output ONLY the JSON object — compact, no prose, no markdown fences, and make sure it is complete.");
    plan = tryParse(raw);
  }
  if (!plan) throw new Error(`Art director did not return valid JSON: ${(raw || "(empty)").slice(0, 160)}`);
  return plan;
}
