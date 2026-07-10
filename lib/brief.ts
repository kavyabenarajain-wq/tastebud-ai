import type { ResolvedBrief, BrandBrain } from "./types";

/** Category-specific art direction — what makes THIS kind of product look its best. */
export function categoryDirective(b?: BrandBrain): string | undefined {
  const t = `${b?.category ?? ""} ${b?.productType ?? ""}`.toLowerCase();
  if (/food|snack|chocolate|bakery|bar\b|meal|sauce|spice|candy|dessert|cereal|cookie|coffee bean|nut|cheese|pasta/.test(t))
    return "APPETITE APPEAL — make it look utterly delicious and freshly made: rich appetising texture, moist / melty / crisp cues, crumbs, garnish, glossy or steamy where right, perfect colour. It should make the viewer hungry.";
  if (/drink|beverage|soda|juice|coffee|tea|water|kombucha|smoothie|cola|seltzer|can\b|bottle|energy|latte|cocktail/.test(t))
    return "BEVERAGE APPEAL — make the drink look vibrant, fresh and crave-able in THIS brand's OWN style. Do NOT default to ice, water beads, condensation or splashes — those are occasional accents for a genuine cold-serve moment only, NEVER on every frame and never unless the brand and this specific shot truly call for it. Most shots should be clean, styled and on-brand with NO ice or water at all. Let the brand's real look lead.";
  if (/fashion|apparel|clothing|wear|footwear|shoe|sneaker|accessor|bag|jewel|denim|streetwear|textile|watch|eyewear/.test(t))
    return "FABRIC TRUTH — let the cloth behave: real drape, fold, weight and weave with wrinkles left in; directional daylight or a hard editorial flash that carves the silhouette and throws a graphic shadow; texture over gloss so you can feel the material. Never ironed-flat, over-retouched catalogue perfection.";
  if (/beauty|skincare|cosmetic|makeup|serum|cream|fragrance|perfume|lotion|balm|lipstick|mascara/.test(t))
    return "MATERIAL & TEXTURE — sculpt with one soft directional source so a real shadow falls (dimension, not clinical flatness); go macro on the substance — the cream's peak, a serum drip, a swatch dragged across skin, glass refracting light; dewy over glossy, true skin with pores when skin shows. Never a waxy, shadowless, poreless render.";
  return undefined;
}

// The four special backgrounds carry intent; every other value is a colour the
// backdrop should literally become.
const BACKGROUND_MAP: Record<string, string> = {
  "Pure white": "a seamless pure-white studio sweep, evenly lit, no visible horizon",
  "Pure black": "a true-black background, the product emerging from darkness",
  "Art-directed": "a fully ART-DIRECTED set built from ONE strong, specific concept rooted in THIS brand's actual world — its story, palette, materials, references and audience — never a generic studio. Commit to a single editorial idea and execute it with the taste of a top campaign: an evocative real environment, a sculptural material study, a tactile surface-and-light composition, or an architectural / natural setting with genuine depth and atmosphere. Use REAL materials with real texture, considered layering and foreground/background depth, intentional negative space, and light that belongs to the concept. It must read like a creative director designed it for a magazine cover. BAN the tired AI look completely: NO floating subject on a pedestal / podium / plinth, NO seamless gradient void, NO concentric spotlight halo, NO random scattered geometric cubes or pebbles, NO fake confetti bokeh, NO plastic CGI-render staging.",
  "Match the product":
    "MATCH THE PRODUCT — the ENTIRE background is ONE seamless, edge-to-edge studio colour field in the SAME colour as the product's own packaging: read the product's dominant colour from the reference and make the WHOLE backdrop that EXACT hue (purple packaging → purple backdrop, blue → blue, green → green, beige → beige, black → black), a single uniform tone just slightly deeper or lighter than the product so it still separates and pops. This is a deliberate CLEAN colour-matched studio shot — the whole frame is this one colour, NOT an environment, textured surface, colour-block split, prop or scene. PRODUCT ONLY — no model, no person, no hands, fingers, arms, legs, feet or any body part anywhere in the frame",
};

function bgPhrase(v?: string): string | undefined {
  if (!v?.trim()) return undefined;
  return BACKGROUND_MAP[v] ?? `a seamless, evenly-lit ${v.toLowerCase()} studio background`;
}

// Each panel choice expands into real direction so the model has something to act on.
// Each vibe is translated into CAMERA DECISIONS — light quality, contrast, grade, surface —
// not marketer adjectives ("premium", "expensive"), which only fetch the model its most
// average image. The mood label survives; how to SHOOT it leads.
const VIBE_MAP: Record<string, string> = {
  "Premium / minimal": "a single subject in calm negative space, one soft directional source with a gentle falloff, a muted low-saturation grade, no props competing for the eye",
  "Luxury / quiet": "soft window light raking tactile materials, deep but open shadows, a warm-neutral matte grade, nothing glossy or loud",
  "Bold & vibrant": "hard directional light, punchy contrast, one saturated colour field, a crisp graphic shadow",
  "Playful & fun": "bright even daylight, a lively pop of saturated colour, one slightly unexpected prop or angle, a light airy grade",
  Editorial: "a considered set with real depth, directional light that sculpts form, a filmic grade with fine grain — magazine-grade art direction",
  "Clean & clinical": "crisp high-key light, a near-white set, a cool-neutral grade, precise centred framing, minimal shadow",
  "Natural / organic": "soft overcast or window daylight, raw materials (linen, wood, stone), an earthy warm grade, a few botanical touches",
  "Warm & cozy": "low golden light, long soft shadows, a warm amber grade, an inviting lived-in surface",
  "Moody / cinematic": "one hard low-key source, deep controlled shadow, high contrast, a desaturated filmic grade with real atmosphere",
  "Fresh & energetic": "bright crisp daylight, high clarity, a cool-fresh grade, clean dewy surfaces",
  "Retro / vintage": "a warm faded film grade with visible grain, period surface and props, slightly soft focus, an analog colour shift",
  "Futuristic / tech": "cool controlled light with clean speculars, sleek reflective surfaces, a cool-blue grade, precise architectural framing",
  "Streetwear / cool": "hard daylight or direct on-camera flash, real urban surfaces (concrete, tile, brick), a gritty contrasty grade, candid attitude",
  "Sensual / tactile": "close macro framing, soft raking light on touchable surfaces, a warm intimate grade, shallow focus",
};

const LIGHTING_MAP: Record<string, string> = {
  "Soft daylight": "soft natural daylight with gentle gradient shadows",
  "Bright & airy (high-key)": "bright high-key lighting, near-shadowless, airy and clean",
  "Moody / low-key": "low-key lighting, deep controlled shadows, a single pool of light",
  "Golden hour": "warm golden-hour light, long soft shadows, amber glow",
  "Hard sunlight & shadow": "hard direct sunlight casting crisp graphic shadows",
  "Studio softbox": "even studio softbox light with soft wraparound highlights",
  "Dramatic single-source": "one dramatic hard key light, strong falloff, sculpted form",
  "Backlit / rim light": "backlight / rim light giving the product a bright separating edge",
  "Neon / coloured gels": "coloured gel lighting, neon accents, a vivid colour wash",
  "Gradient glow": "a soft gradient glow behind the product, a halo of light",
  "Natural window light": "directional natural window light with soft falloff",
  "Direct flash": "hard direct flash, punchy highlights, a bold contemporary look",
};

const COMPOSITION_MAP: Record<string, string> = {
  "Centered hero": "centered hero composition, product dead-center, balanced",
  "Rule of thirds": "rule-of-thirds placement, dynamic off-center balance",
  "Generous negative space": "generous negative space, product small within a calm frame",
  "Tight crop": "tight crop, the product filling the frame, intimate",
  "Overhead flat-lay": "overhead flat-lay, top-down, a styled arrangement",
  "Floating / levitation": "the product floating / levitating, weightless and dynamic",
  "Grouped still life": "a grouped still-life with considered supporting props",
  Symmetrical: "perfectly symmetrical, formal, architectural balance",
  "Diagonal / dynamic": "a diagonal, dynamic composition with energy and motion",
  "Single subject, minimal": "a single subject, minimal, nothing extraneous",
  "Layered depth": "layered depth — foreground / background separation with bokeh",
};

const STYLING_MAP: Record<string, string> = {
  "Minimal / clean": "minimal, clean styling — the product nearly alone with calm space, one or two restrained props at most",
  "A few props": "a few well-chosen supporting props placed near the product with intent",
  "Maximal — prop-rich": "a MAXIMAL, abundant editorial scene — surround the product with a generous, energetic but tasteful scatter of its OWN real, relevant supporting elements (for food/drink: fresh produce, whole spices, citrus halves, herbs, garnish — only add ice or a splash if the brand genuinely calls for it; for beauty: botanicals, raw ingredients, swatches) arranged with rhythm. The product stays the clear hero, every prop crisp and identifiable. Vibrant and abundant — never messy or cluttered",
  "Ingredient scatter": "the product surrounded by an artful scatter of its key real ingredients laid across the surface in front and around it, like a deconstructed recipe, each one sharp and identifiable",
  "Bold colour-block": "a bold, saturated colour-blocked set — a vivid background wall meeting a contrasting coloured surface (two-tone), high-contrast and punchy, the product popping against the colour",
};

const expand = (map: Record<string, string>, v?: string) => (v?.trim() ? map[v] ?? v : undefined);

/** Turn the panel + express prompt into one readable brief for the art director. */
export function buildBrief(b: ResolvedBrief): string {
  const p = b.panel ?? {};
  const lines: string[] = [];
  if (b.express?.trim()) lines.push(`★ WHAT THE CLIENT ASKED FOR, IN THEIR OWN WORDS — the single most important instruction, execute it precisely: "${b.express.trim()}". This is the primary direction for the shoot. Deliver EXACTLY this. It OVERRIDES the brand's usual look, signature and defaults wherever they differ — the only things that outrank it are reproducing the real product exactly and the brand's do-not list. Do not replace their request with the brand's default aesthetic; build their idea, applying the brand's craft within it.`);
  const field = (label: string, v?: string) => { if (v?.trim()) lines.push(`${label}: ${v.trim()}`); };
  field("Background", bgPhrase(p.background));
  field("Surface the product sits on", p.surface);
  field("Vibe", expand(VIBE_MAP, p.vibe));
  field("Lighting", expand(LIGHTING_MAP, p.lighting));
  field("Composition", expand(COMPOSITION_MAP, p.composition));
  field("Styling", expand(STYLING_MAP, p.styling));
  field("Output format", p.format);
  field("Must include", p.include);
  const cat = categoryDirective(b.brand);
  if (cat) lines.push(cat);
  if (b.references?.length) lines.push(`STYLE REFERENCE PROVIDED (${b.references.length} image${b.references.length > 1 ? "s" : ""}) — match its look: background, palette, prop styling, lighting and composition. This drives the art direction; treat the panel as secondary.`);
  lines.push(`Products uploaded: ${b.products?.length ?? 0}.`);
  lines.push("PRIORITY: the client's own-words request (if any, marked ★ above) comes FIRST — deliver it. Then honour any panel choices as hard direction. Then fill ONLY the still-unspecified fields from the Brand Profile. Vibe, lighting and composition must work together as one coherent look.");
  return lines.join("\n");
}

// ─── Model photoshoot ─────────────────────────────────────────────────────

const PRODUCT_USE_MAP: Record<string, string> = {
  Worn: "the product WORN on the body at true scale, sitting and draping like real material on a real person",
  Held: "the product HELD naturally in the hand, fingers wrapping it the way a person actually would, label facing camera",
  Applied: "the product being APPLIED — to skin, face, hair or lips — caught in a believable mid-use moment",
  "In-context": "the product present in the scene WITH the model, used or placed naturally in the moment, not pinned in like a prop",
  None: "no product in frame — a pure model / portrait shot",
};

/**
 * Describe the curated model as a real, specific individual. Every field is
 * optional; blanks are simply omitted so the art director fills them from the
 * brand's casting register.
 */
function describeModel(m: NonNullable<ResolvedBrief["model"]>): string {
  if (m.source === "reference") {
    return (
      "THE MODEL IS PROVIDED AS A LIKENESS REFERENCE PHOTO (attached). Reproduce THAT exact person faithfully — their face shape, features, skin tone, hair and body kept true to the reference. " +
      "Do NOT beautify the identity away: do not slim them, lighten their skin, sharpen their features, or swap them for a more conventional face. It must be recognisably THEM, only re-lit and re-styled for this brand. Hold the identity stable across every frame of the set. " +
      "The reference is for the PERSON ONLY — ignore whatever they are wearing or holding in it and any branding visible; the product (if any) comes solely from the separate product image, reproduced exactly."
    );
  }
  const bits: string[] = [];
  if (m.gender?.trim()) bits.push(m.gender.trim().toLowerCase());
  if (m.ageRange?.trim()) bits.push(`in their ${m.ageRange.trim().replace(/^in their /i, "")}`);
  if (m.ethnicity?.trim()) bits.push(`${m.ethnicity.trim()} heritage`);
  if (m.skinTone?.trim()) bits.push(`${m.skinTone.trim().toLowerCase()} skin`);
  const hair = [m.hairStyle?.trim(), m.hairColor?.trim()].filter(Boolean).join(", ");
  if (hair) bits.push(`${hair} hair`.toLowerCase());
  if (m.eyes?.trim()) bits.push(`${m.eyes.trim().toLowerCase()} eyes`);
  if (m.bodyType?.trim()) bits.push(`${m.bodyType.trim().toLowerCase()} build`);
  const who = bits.length ? `A real, specific ${bits.join(", ")}` : "A real, specific model cast for this brand";
  const vibe = m.vibe?.trim() ? ` Casting energy: ${m.vibe.trim().toLowerCase()}.` : "";
  const expr = m.expression?.trim() ? ` Expression: ${m.expression.trim().toLowerCase()}.` : "";
  return (
    `BUILD THE MODEL as one consistent individual (not a generic stock face): ${who}.${vibe}${expr} ` +
    "Lock this same person — same face, same body — across every frame so the set reads as one shoot."
  );
}

/** Turn the model spec + light scene panel + express prompt into a model-shoot brief. */
export function buildModelBrief(b: ResolvedBrief): string {
  const p = b.panel ?? {};
  const lines: string[] = [];
  if (b.express?.trim()) lines.push(`★ WHAT THE CLIENT ASKED FOR, IN THEIR OWN WORDS — the single most important instruction, execute it precisely: "${b.express.trim()}". This is the primary direction for the shoot. Deliver EXACTLY this. It OVERRIDES the brand's usual look and defaults wherever they differ — only reproducing the real product exactly, the human-realism bar, and the brand's do-not list outrank it. Do not replace their request with a default aesthetic.`);
  if (b.model) lines.push(describeModel(b.model));

  const use = b.model?.productUse?.trim();
  if (use && PRODUCT_USE_MAP[use]) lines.push(`Product interaction: ${PRODUCT_USE_MAP[use]}.`);
  else if ((b.products?.length ?? 0) > 0) lines.push(`Product interaction: ${PRODUCT_USE_MAP.Held}.`);

  const field = (label: string, v?: string) => { if (v?.trim()) lines.push(`${label}: ${v.trim()}`); };
  field("Setting / background", bgPhrase(p.background));
  field("Scene mood", expand(VIBE_MAP, p.vibe));
  field("Lighting", expand(LIGHTING_MAP, p.lighting));
  field("Composition", expand(COMPOSITION_MAP, p.composition));
  field("Output format", p.format);
  field("Must include", p.include);

  if ((b.products?.length ?? 0) > 0) lines.push(`Product uploaded: ${b.products!.length}. It is the client's REAL product — reproduce it exactly (shape, cut, fabric, wash/colour, label, every word of text) and place it on the model at true real-world scale with real contact, occlusion and shadow. IF IT IS CLOTHING, IT IS THE FIXED WARDROBE HERO: the model wears this exact garment in every frame, identical across the whole set — do NOT invent, substitute, recolour or restyle the clothing; style only around it (other layers, accessories, setting, hair).`);
  if (b.references?.length) lines.push(`STYLE REFERENCE PROVIDED (${b.references.length}) — match its art direction: wardrobe register, set, palette, lighting and composition. It is a LOOK reference only — never copy any person or product from it.`);

  lines.push(
    "HUMAN-REALISM IS THE BAR: real skin with pores and subsurface light, alive catch-lit eyes, natural hands with correct fingers, believable hair with flyaways, slight human asymmetry — never a waxy, plastic, airbrushed AI face. Wardrobe, styling, set and grade all bend to the brand. Honour every scene choice above; fill only the blanks from the Brand Profile."
  );
  return lines.join("\n");
}

const FORMAT_ASPECT: Record<string, string> = {
  "Portrait 4:5": "4:5",
  "Square 1:1": "1:1",
  "Story 9:16": "9:16",
  "Wide 16:9": "16:9",
};

/** The model's aspect-ratio string for a chosen format (defaults to 4:5 portrait). */
export function formatToAspect(format?: string): string {
  return (format && FORMAT_ASPECT[format]) || "4:5";
}

const SUPPORTED_ASPECTS: [string, number][] = [
  ["1:1", 1], ["4:5", 0.8], ["5:4", 1.25], ["3:4", 0.75], ["4:3", 1.333], ["2:3", 0.667], ["3:2", 1.5], ["9:16", 0.5625], ["16:9", 1.778],
];

/** Nearest model-supported aspect string for a numeric ratio (for upscaling a recropped shot). */
export function numberToAspect(n?: number): string {
  if (!n || !isFinite(n)) return "4:5";
  return SUPPORTED_ASPECTS.reduce((best, cur) => (Math.abs(cur[1] - n) < Math.abs(best[1] - n) ? cur : best))[0];
}

const MAX_TOTAL = 24; // safety cap on a single run

/** angles × shotsPerAngle. shotsPerAngle is shots PER angle (3 angles, 5 shots = 15 images). */
export function counts(b: ResolvedBrief): { angles: number; perAngle: number; total: number } {
  const angles = Math.max(1, Math.min(6, b.panel?.numAngles ?? 1));
  let perAngle = Math.max(1, Math.min(6, b.panel?.shotsPerAngle ?? 1));
  if (angles * perAngle > MAX_TOTAL) perAngle = Math.max(1, Math.floor(MAX_TOTAL / angles));
  return { angles, perAngle, total: angles * perAngle };
}
