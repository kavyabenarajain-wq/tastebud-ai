/**
 * Product category → how a human may physically interact with it.
 *
 * This is the ONE source of truth that stops the model photoshoot from doing
 * physically nonsensical things — a person can NEVER "wear" an ice cream or a
 * sofa. It is a PURE module (no `sharp`, no `fs`, no network) so it is safe to
 * import from BOTH the server (brief.ts, model-agent.ts, image.ts) and client
 * components (studio pages), keeping the rule identical everywhere.
 *
 * It intentionally mirrors the category detection in photoRules.ts (categoryBook)
 * but stays dependency-free — photoRules pulls in `sharp` via ./finish and can
 * never be imported client-side.
 */

export type ProductCategory =
  | "food"
  | "drink"
  | "apparel"
  | "jewellery"
  | "beauty"
  | "wellness"
  | "furniture"
  | "tech"
  | "home"
  | "general";

/** A canonical interaction "mode" — the verb a person performs with the product. */
export type InteractionMode =
  | "Eaten"
  | "Licked"
  | "Sipped"
  | "Poured"
  | "Worn"
  | "Applied"
  | "Taken"
  | "SatOn"
  | "LoungedOn"
  | "SleptOn"
  | "Used"
  | "Held"
  | "Shown"
  | "InContext"
  | "None";

/** Human-facing label + the sentence fragment the renderer gets, per mode. */
const MODE: Record<InteractionMode, { label: string; action: string }> = {
  Eaten: { label: "Eating it", action: "caught mid-bite into the real product — a genuine bite mark, with crumb, melt, cheese-pull or filling showing where the food warrants it; shot close on the person's mouth and hands at the peak-appetite moment, the food fresh, glossy and just-made, never plastic or styled-stiff" },
  Licked: { label: "Licking / tasting it", action: "tasting the product — tongue or lips just making contact, a bead, drip or gloss of it on the surface or the lip; close, warm and appetising, the food looking freshly made not set" },
  Sipped: { label: "Sipping it", action: "sipping the drink — the vessel raised to the lips with real contact and a slight tilt that shows the liquid; condensation and cold beads on a chilled glass or a faint curl of steam on a hot one, caught mid-sip" },
  Poured: { label: "Pouring it", action: "pouring the drink into a glass held in hand — a real falling stream with a small crown and live bubbles where it lands, the liquid in its true colour and viscosity, caught mid-pour" },
  Worn: { label: "Wearing it", action: "wearing the product on the body in its correct anatomical position" },
  Applied: { label: "Applying it", action: "applying the product to the skin, face, lips or hair" },
  Taken: { label: "Taking it", action: "taking the supplement — a capsule, tablet, gummy or measured scoop at the open lips or resting in an open palm, or a scoop of powder stirred into a glass; calm daily-routine energy, natural and unforced" },
  SatOn: { label: "Sitting on it", action: "sitting on the product naturally, relaxed" },
  LoungedOn: { label: "Lounging on it", action: "lounging, reclining or leaning back on the product" },
  SleptOn: { label: "Resting / sleeping on it", action: "resting or lying asleep on the product" },
  Used: { label: "Using it", action: "holding and actively using the product the way it is meant to be used" },
  Held: { label: "Holding it", action: "holding the product naturally in hand" },
  Shown: { label: "Showing it to camera", action: "holding the product up and presenting it toward the camera" },
  InContext: { label: "In the scene (no touch)", action: "present in the same scene with the product used naturally in context, not necessarily touched" },
  None: { label: "No person / product apart", action: "no direct interaction — the person and product simply share the frame" },
};

interface CategorySpec {
  /** first mode is the PRIMARY / default action for the category */
  options: InteractionMode[];
  /** true ONLY for categories a human can genuinely wear on the body */
  canWear: boolean;
}

const CATEGORY: Record<ProductCategory, CategorySpec> = {
  food: { options: ["Eaten", "Licked", "Shown", "Held", "InContext"], canWear: false },
  drink: { options: ["Sipped", "Poured", "Held", "Shown", "InContext"], canWear: false },
  apparel: { options: ["Worn", "InContext"], canWear: true },
  jewellery: { options: ["Worn", "Shown", "InContext"], canWear: true },
  beauty: { options: ["Applied", "Held", "Shown", "InContext"], canWear: false },
  wellness: { options: ["Taken", "Held", "Shown", "InContext"], canWear: false },
  furniture: { options: ["SatOn", "LoungedOn", "SleptOn", "InContext"], canWear: false },
  tech: { options: ["Used", "Held", "Worn", "Shown", "InContext"], canWear: true },
  home: { options: ["Used", "Held", "InContext"], canWear: false },
  general: { options: ["Held", "Used", "Shown", "InContext"], canWear: false },
};

// Ordered so the most specific / collision-prone categories win first.
// (e.g. "ice cream" must hit food before beauty's "cream"; "chair" must hit
// furniture before beauty's "hair".)
const DETECT: { category: ProductCategory; test: RegExp }[] = [
  { category: "apparel", test: /\b(fashion|apparel|clothing|clothes|footwear|shoe|sneaker|boot|denim|jeans|streetwear|coat|dress|jacket|hoodie|knit|garment|shirt|tee|t-?shirt|blouse|pants|trouser|skirt|sock|lingerie|swimwear|bikini|activewear|legging|scarf|glove|hat|cap)\b/i },
  { category: "jewellery", test: /\b(jewel\w*|ring|rings|necklace|earring|bracelet|pendant|anklet|brooch|bangle|charm)\b/i },
  { category: "furniture", test: /\b(furniture|sofa|couch|settee|armchair|chair|recliner|bed|beds|bedframe|headboard|mattress|table|desk|dresser|nightstand|wardrobe|shelf|shelving|bookcase|ottoman|stool|bench|cabinet|futon|daybed|bean.?bag|hammock)\b/i },
  // Wellness BEFORE food so "protein powder" routes to wellness while "protein bar" stays food.
  { category: "wellness", test: /\b(supplement|vitamin|multivitamin|probiotic|prebiotic|collagen|protein.?powder|nootropic|electrolyte|creatine|adaptogen|greens|capsule|softgel|pill|wellness)\b/i },
  // NOTE: bare `bar` dropped (matched "soap bar", "bar cart") — use compound snack/granola-bar tokens.
  { category: "food", test: /\b(food|snack|chocolate|bakery|meal|sauce|spice|candy|dessert|cereal|cookie|biscuit|cheese|pasta|honey|jam|granola|ice.?cream|gelato|popsicle|lolly|chips|crisp|pizza|burger|fruit|protein.?bar|energy.?bar|snack.?bar|granola.?bar|gummy|gummies)\b/i },
  // NOTE: bare `can` (the modal verb) and `bottle` (perfume/serum bottle) dropped to stop catastrophic mislabels.
  { category: "drink", test: /\b(drink|beverage|soda|juice|coffee|tea|water|kombucha|smoothie|cola|seltzer|energy.?drink|latte|cocktail|wine|beer|spirit|whisky|vodka|milk|shake|lemonade|soft.?drink|iced.?tea|sparkling.?water)\b/i },
  { category: "beauty", test: /\b(beauty|skincare|cosmetic|makeup|serum|cream|moisturi\w*|fragrance|perfume|lotion|balm|lipstick|lip|mascara|foundation|soap|shampoo|conditioner|haircare|hair|nail|cleanser|sunscreen|toner|mask)\b/i },
  { category: "tech", test: /\b(tech|electronic\w*|gadget|device|audio|headphone|earbud|earphone|speaker|phone|smartphone|laptop|tablet|camera|watch|smartwatch|charger|wearable|console|keyboard|drone)\b/i },
  { category: "home", test: /\b(candle|home|decor|homeware|ceramic|vase|mug|cup|plate|bowl|cutlery|kitchenware|utensil|interior|diffuser|incense|blanket|throw|rug|cushion|pillow|towel|linen|bedding|sheet|duvet|tableware)\b/i },
];

/**
 * Best-effort category from any free text — brand name, positioning, product
 * names, the client's own words. First match wins; falls back to "general".
 */
export function detectCategory(...texts: (string | null | undefined)[]): ProductCategory {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t.trim()) return "general";
  for (const { category, test } of DETECT) if (test.test(t)) return category;
  return "general";
}

/** True only when a human can genuinely wear this category on the body. */
export function canWear(category: ProductCategory): boolean {
  return CATEGORY[category].canWear;
}

/** The category's primary (default) interaction mode. */
export function primaryMode(category: ProductCategory): InteractionMode {
  return CATEGORY[category].options[0];
}

// Normalise legacy / free-text productUse values onto a canonical mode.
const ALIAS: Record<string, InteractionMode> = {
  worn: "Worn", wear: "Worn", wearing: "Worn",
  held: "Held", hold: "Held", holding: "Held", "in-hand": "Held",
  applied: "Applied", apply: "Applied", applying: "Applied",
  "in-context": "InContext", incontext: "InContext", context: "InContext", lifestyle: "InContext",
  none: "None", "no": "None",
  eaten: "Eaten", eat: "Eaten", eating: "Eaten", bite: "Eaten",
  licked: "Licked", lick: "Licked", tasting: "Licked",
  sipped: "Sipped", sip: "Sipped", drinking: "Sipped", drink: "Sipped",
  poured: "Poured", pour: "Poured",
  saton: "SatOn", "sit": "SatOn", sitting: "SatOn",
  loungedon: "LoungedOn", lounge: "LoungedOn", reclining: "LoungedOn", leaning: "LoungedOn",
  slepton: "SleptOn", sleep: "SleptOn", resting: "SleptOn", lying: "SleptOn",
  used: "Used", use: "Used", using: "Used",
  shown: "Shown", show: "Shown", showing: "Shown", presenting: "Shown",
  taken: "Taken", take: "Taken", taking: "Taken", swallow: "Taken", scoop: "Taken",
};

function toMode(v?: string | null): InteractionMode | undefined {
  if (!v) return undefined;
  const k = v.trim().toLowerCase();
  if ((MODE as Record<string, unknown>)[v.trim()]) return v.trim() as InteractionMode; // already canonical
  return ALIAS[k];
}

/**
 * THE GUARDRAIL. Resolve a believable interaction for a category, honouring an
 * explicit request ONLY when it makes physical sense. A "Worn" request on a
 * non-wearable (food, furniture, a drink) is overridden to the category's
 * natural action — this is the "you cannot wear an ice cream" rule.
 */
export function resolveInteraction(
  category: ProductCategory,
  requested?: string | null,
): { mode: InteractionMode; action: string; overridden: boolean } {
  const spec = CATEGORY[category];
  const req = toMode(requested);

  // Explicit "wear" on something un-wearable → override to the natural action.
  if (req === "Worn" && !spec.canWear) {
    const mode = spec.options[0];
    return { mode, action: MODE[mode].action, overridden: true };
  }
  // Honour any request that is plausible for the category (or a universal one).
  const universal: InteractionMode[] = ["Held", "Shown", "InContext", "None", "Used"];
  if (req && (spec.options.includes(req) || universal.includes(req))) {
    return { mode: req, action: MODE[req].action, overridden: false };
  }
  // Nothing usable → category default.
  const mode = spec.options[0];
  return { mode, action: MODE[mode].action, overridden: !!req };
}

/** Options for a category, ready for a UI <select> ({ value, label }). */
export function interactionOptions(category: ProductCategory): { value: InteractionMode; label: string }[] {
  return CATEGORY[category].options.map((m) => ({ value: m, label: MODE[m].label }));
}

/** The action sentence for a mode (used by the renderer / brief). */
export function actionFor(mode: InteractionMode): string {
  return MODE[mode].action;
}

/**
 * A short, human-readable list of the natural things to do with this category,
 * for the agent persona and briefs (e.g. "eating it, licking it, showing it to
 * camera"). Never includes wearing unless the category is genuinely wearable.
 */
export function naturalActions(category: ProductCategory): string {
  return CATEGORY[category].options
    .filter((m) => m !== "None" && m !== "InContext")
    .map((m) => MODE[m].label.toLowerCase())
    .join(", ");
}

/** Is this interaction wear-based? (renderer uses this to gate wardrobe prose). */
export function isWear(mode: InteractionMode): boolean {
  return mode === "Worn";
}

// ── OBJECT-CLASS LOCK ────────────────────────────────────────────────────────
// The category rules above govern the human VERB (can a person wear it?). This
// section governs the object CLASS itself: a clothing product must only ever be
// rendered AS clothing — never restyled into a perfume bottle, a cup, furniture,
// a snack or any other kind of object. It reaches BOTH renderers (product + model)
// and the QC judge, so cross-category drift is caught at prompt-time and at review.

export const ALL_CATEGORIES: ProductCategory[] = [
  "food", "drink", "apparel", "jewellery", "beauty", "wellness", "furniture", "tech", "home", "general",
];

/** What each category IS (its object class) and the classes it must NEVER become. */
const CATEGORY_CLASS: Record<ProductCategory, { is: string; never: string[] }> = {
  apparel: { is: "a wearable garment / apparel item (clothing, footwear or a worn accessory)", never: ["a bottle", "a jar", "a tube", "a can", "a cup", "a perfume or fragrance bottle", "a food item", "a drink", "a piece of furniture", "an electronic device", "any non-garment object"] },
  jewellery: { is: "a piece of jewellery", never: ["a garment or clothing", "a bottle", "a jar", "a food item", "a drink", "furniture", "an electronic device"] },
  beauty: { is: "a beauty / cosmetic product in its real container (bottle, jar, tube, compact, stick or pump)", never: ["a garment or clothing", "a food item", "a drink", "a snack", "a piece of furniture", "an electronic device"] },
  wellness: { is: "a wellness / supplement product in its real container (bottle, jar, tub, sachet, blister or capsule)", never: ["a garment or clothing", "a snack food", "a drink in a glass", "a piece of furniture", "a perfume or fragrance bottle"] },
  food: { is: "a food item / edible product", never: ["a garment or clothing", "a drink in a glass", "a cosmetic or beauty product", "a bottle of perfume", "a piece of furniture", "an electronic device"] },
  drink: { is: "a drink / beverage in its real vessel", never: ["a garment or clothing", "a solid food item", "a cosmetic or beauty product", "a piece of furniture", "an electronic device"] },
  furniture: { is: "a piece of furniture", never: ["a garment or clothing", "a food item", "a drink", "a small handheld product", "a bottle", "a cosmetic"] },
  tech: { is: "an electronic device / gadget", never: ["a food item", "a drink", "a garment (unless it is genuinely wearable tech)", "a cosmetic or beauty product", "a piece of furniture"] },
  home: { is: "a homeware / decor object", never: ["a garment or clothing", "a food item", "a drink", "a cosmetic or beauty product"] },
  general: { is: "", never: [] },
};

/**
 * Map any free-text category guess (e.g. from the product-image vision pass) onto the
 * canonical enum. Exact enum match first, else route the words through detectCategory.
 * Returns undefined when nothing confident is found (caller keeps its own fallback).
 */
export function coerceCategory(v?: string | null): ProductCategory | undefined {
  if (!v) return undefined;
  const k = v.trim().toLowerCase();
  const exact = ALL_CATEGORIES.find((c) => c === k);
  if (exact) return exact;
  const d = detectCategory(v);
  return d === "general" ? undefined : d;
}

/** The object-class noun for a category ("a wearable garment", …) — used by the QC judge. */
export function categoryLabel(category: ProductCategory): string {
  return CATEGORY_CLASS[category].is;
}

/** Per-category "never render it as …" negatives, for the renderer's Avoid list. Empty for "general". */
export function categoryNegatives(category: ProductCategory): string[] {
  const spec = CATEGORY_CLASS[category];
  if (!spec.is || !spec.never.length) return [];
  return [
    `rendering the product as ${spec.never.join(", ")}, or any other class of object`,
    "changing the product's fundamental object type, category or form factor",
    "substituting a different KIND of product for the client's",
  ];
}

/**
 * THE OBJECT-CLASS LOCK block. Asserts the product's category is fixed and it must never be
 * turned into another kind of object. Holds even when matching a reference or at reduced
 * fidelity. Returns "" for "general" (no confident category → no lock, so we never wrongly
 * constrain an unknown product).
 */
export function categoryLock(category: ProductCategory): string {
  const spec = CATEGORY_CLASS[category];
  if (!spec.is) return "";
  return (
    `PRODUCT CATEGORY LOCK — the client's product IS ${spec.is}, and the generated image MUST keep it as exactly that. ` +
    `It must NEVER be turned into ${spec.never.join(", ")}, or any other class of object. ` +
    `Its real-world object type, form factor and function are FIXED and non-negotiable — only the scene, camera angle, styling and (for a model) how it is worn/held may change. ` +
    `This holds even when matching a reference image and even at reduced fidelity: if a reference shows a DIFFERENT kind of object, the client's product still keeps ITS own category, never the reference's.`
  );
}
