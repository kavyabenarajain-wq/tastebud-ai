import type { PhotoRules } from "./types";
import { deriveGrade } from "./finish";

/**
 * The photographic rulebook. Instead of storing a brand's colours and calling it
 * "guidelines", we LOOK at the brand's own photos and write down the rules they always
 * follow — their light, lens, grade, surfaces, composition — and, crucially, the list of
 * things they NEVER do. Every new image is then built from these rules, so it could sit
 * in the brand's real feed without anyone noticing it's new.
 *
 * Category-aware: a food brand is read through the food-photography book, a fashion brand
 * through the fashion book. Each book talks like a photographer (angle, light, aperture,
 * time of day), never like a marketer ("premium", "high quality").
 */

interface Book { test: RegExp; label: string; rules: string; neverDo: string[] }

// The per-category photography books — how THIS kind of product is actually shot well,
// and the clichés a real photographer in that category never commits.
const BOOKS: Book[] = [
  {
    test: /food|snack|chocolate|bakery|bar\b|meal|sauce|spice|candy|dessert|cereal|cookie|nut|cheese|pasta|honey|jam|granola/,
    label: "Food",
    rules:
      "Shoot food low (15–30° from the surface) or straight overhead — never flat eye-level. Hard-ish directional light from behind or the side to rake texture and make edges glisten and cast a real shadow. Show just-made life: crumbs, a torn edge, a drip, steam, a bite taken, a smear on the plate. Shallow depth so one morsel is tack-sharp and the rest falls off. Real utensils, linen, boards and raw ingredients — never plastic props.",
    neverDo: ["glossy over-saturated HDR 'food-porn' sheen", "flat, even front light with no shadow", "a pristine untouched hero with zero life or crumbs", "fake plastic garnish that was never part of the dish", "cold blue-white supermarket lighting"],
  },
  {
    test: /drink|beverage|soda|juice|coffee|tea|water|kombucha|smoothie|cola|seltzer|energy|latte|cocktail|wine|beer|spirit/,
    label: "Beverage",
    rules:
      "Backlight or side-light the drink so liquid glows and the vessel's edge separates. Shoot near eye-level or a touch below for presence. Condensation and ice ONLY for a genuine cold-serve moment — never by default. Let bubbles, pour, foam or a lipstick mark on the glass carry the life. Real bar/kitchen/table surfaces, honest reflections, one soft or hard source with intent.",
    neverDo: ["condensation and ice slapped on every frame", "a floating can on a gradient void", "flat front light that kills the liquid glow", "over-styled splash crowns that never happen in life", "a perfectly clean glass with no human trace"],
  },
  {
    test: /fashion|apparel|clothing|wear|footwear|shoe|sneaker|denim|streetwear|textile|coat|dress|jacket|knit|garment/,
    label: "Fashion / Apparel",
    rules:
      "Let fabric behave: real drape, fold, weight and weave, wrinkles left in. Directional daylight or a hard editorial flash that carves the silhouette and throws a graphic shadow. 50–85mm, shot open for a soft ground; or a wide environmental frame with the garment lived-in. Texture over gloss — you should feel the cloth. Real locations (concrete, stairwells, tiled floors, painted walls) or a considered studio sweep with a strong single colour.",
    neverDo: ["a garment ironed to a lifeless mannequin flatness", "beauty-dish everywhere, no shadow, no mood", "over-retouched plastic fabric with no weave", "a floating product on a seamless white e-com void as the hero", "stiff, symmetrical catalogue posing"],
  },
  {
    test: /beauty|skincare|cosmetic|makeup|serum|cream|fragrance|perfume|lotion|balm|lipstick|mascara|soap|hair|nail/,
    label: "Beauty",
    rules:
      "Sculpt with one soft directional source and let a real shadow fall — dimension, not clinical flatness. Macro the texture: the cream's peak, a serum drip, a swatch dragged across skin, glass refracting light. True skin with pores when skin is shown. Dewy over glossy. Considered surfaces — stone, glass, water, raw plaster, pressed flowers — keyed to the brand, not a generic bathroom.",
    neverDo: ["waxy CGI-clean surfaces with no texture", "clinical shadowless beauty light on everything", "a product levitating in a pastel gradient cloud", "over-perfect poreless plastic skin", "fake water droplets scattered at random"],
  },
  {
    test: /tech|electronic|gadget|device|audio|headphone|speaker|phone|laptop|camera|watch|charger|wearable/,
    label: "Tech",
    rules:
      "Controlled, motivated light with clean speculars that read the material honestly (aluminium, glass, matte plastic). One key with intent, a graphic shadow, true reflections. Tight and architectural, or in a real desk/hand/pocket context. Precision, not sci-fi glow.",
    neverDo: ["floating device on a blue holographic gradient", "sci-fi neon rim-light for no reason", "fake lens-flare and HUD graphics", "sterile shadowless studio with no material read", "a levitating product on a plinth"],
  },
  {
    test: /candle|home|decor|homeware|ceramic|linen|furniture|kitchenware|interior|diffuser|incense/,
    label: "Home / Lifestyle",
    rules:
      "Soft window daylight, long honest shadows, a lived-in surface — wood, linen, stone, a real shelf or table. Warm and tactile, styled but not staged, a sense that someone lives here. 35–50mm, natural depth. Props are real objects in the room, sparse and intentional.",
    neverDo: ["a showroom-perfect set with no life", "hard flat commercial light", "a product isolated on a white void", "random scattered decorative pebbles and dried stems as filler", "an obviously CGI-rendered room"],
  },
  {
    test: /jewel|ring|necklace|earring|watch|accessor|bag|eyewear|sunglass|leather/,
    label: "Jewellery / Accessories",
    rules:
      "Precise light that reads metal, stone and leather truthfully — controlled speculars, a real gradient reflection, a soft graphic shadow. Macro on the detail: clasp, grain, facet, stitch. On skin, stone, silk or raw plaster for scale and warmth. Restraint over sparkle-overload.",
    neverDo: ["blown-out sparkle stars and fake lens glints", "a piece floating in a black glossy void", "over-polished CGI metal with no honest reflection", "cluttered velvet-box cliché staging", "flat light that kills the material"],
  },
];

const DEFAULT_BOOK: Book = {
  label: "General product",
  test: /.^/,
  rules:
    "Photograph it like a real object in a real place: one motivated light source with a believable direction and a real contact shadow, honest material behaviour, a genuine surface with texture, and a shallow, natural depth of field. Camera decisions lead — lens, aperture, time of day — not adjectives.",
  neverDo: ["a floating product on a gradient void", "flat, even, sourceless light", "a plastic CGI-render look", "random scattered geometric props", "a concentric spotlight halo behind the subject"],
};

/** The photography book for a brand's category (falls back to a sensible general book). */
export function categoryBook(category?: string, productType?: string): Book {
  const t = `${category ?? ""} ${productType ?? ""}`.toLowerCase();
  return BOOKS.find((b) => b.test.test(t)) ?? DEFAULT_BOOK;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch an image URL/path to a Gemini inline part (base64). Null on any failure. */
async function toInlinePart(url: string): Promise<{ mime_type: string; data: string } | null> {
  try {
    if (!/^https?:\/\//i.test(url)) return null; // brand feed photos are always remote URLs
    const res = await fetch(url);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { mime_type: ct, data };
  } catch {
    return null;
  }
}

const VisionShape = ["light", "lens", "grade", "composition"] as const;

/**
 * LOOK at the brand's own photos and extract the rules they follow. Uses Gemini vision
 * when GEMINI_API_KEY is set + photos exist; otherwise falls back to the category book +
 * the researched aesthetic text. The numeric colour grade is ALWAYS derived from the real
 * pixels (sharp, no API), so the finishing pass is keyed to the brand even with no vision.
 */
export async function extractPhotoRules(args: {
  images: string[];
  category?: string;
  productType?: string;
  aesthetic?: string;
}): Promise<PhotoRules> {
  const book = categoryBook(args.category, args.productType);
  const images = (args.images ?? []).filter(Boolean).slice(0, 6);
  // The grade is derived from real pixels regardless of whether vision runs.
  const colorGrade = await deriveGrade(images);

  const fallback = (): PhotoRules => ({
    category: book.label,
    grade: (args.aesthetic ?? "").trim() || undefined,
    signatures: (args.aesthetic ?? "").trim() ? [args.aesthetic!.trim()] : undefined,
    neverDo: book.neverDo,
    colorGrade,
  });

  if (!process.env.GEMINI_API_KEY || !images.length) return fallback();

  try {
    const parts = (await Promise.all(images.map(toInlinePart))).filter(Boolean) as { mime_type: string; data: string }[];
    if (!parts.length) return fallback();
    const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
    const key = process.env.GEMINI_API_KEY!;
    const prompt =
      `You are a photography director studying a brand's REAL published photos to write their shooting rulebook, read through the ${book.label} photography book.\n` +
      `${book.label} craft to check against: ${book.rules}\n\n` +
      `Look ONLY at what is actually in these images — do NOT invent or flatter. Write the RULES this brand consistently follows, in a photographer's language (light, lens, aperture, time of day, surface), never marketing words like "premium" or "high quality".\n` +
      `Return STRICT JSON ONLY:\n` +
      `{"light":"their signature light — quality, direction, hard/soft, time of day","lens":"lens/focal-length/aperture/depth-of-field habit you can infer","grade":"the colour grade in words (e.g. warm-neutral, lifted blacks, muted greens, matte)","surfaces":["the surfaces/sets they shoot on"],"composition":"crop, negative space and placement habit","signatures":["3-6 moves they ALWAYS make — their tells"],"neverDo":["4-8 things they NEVER do — clichés absent from their work"]}`;
    const body = { contents: [{ parts: [{ text: prompt }, ...parts.map((p) => ({ inline_data: p }))] }] };

    let j: any;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      j = await res.json();
      if (!j.error) break;
      if (i < 2) await sleep(600 * 2 ** i);
    }
    const text: string = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback();
    const parsed = JSON.parse(m[0]);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim()) : []);
    // Merge the model-observed never-do list with the category book's clichés (deduped).
    const neverDo = Array.from(new Set([...arr(parsed.neverDo), ...book.neverDo])).slice(0, 12);
    return {
      category: book.label,
      light: str(parsed.light),
      lens: str(parsed.lens),
      grade: str(parsed.grade) ?? ((args.aesthetic ?? "").trim() || undefined),
      surfaces: arr(parsed.surfaces).slice(0, 8),
      composition: str(parsed.composition),
      signatures: arr(parsed.signatures).slice(0, 8),
      neverDo,
      colorGrade,
    };
  } catch {
    return fallback();
  }
}

/** Render a brand's photo-rules into a hard directive block for the art director. */
export function photoRulesDirective(r?: PhotoRules): string | undefined {
  if (!r) return undefined;
  const L: string[] = [];
  if (r.category) L.push(`Read through the ${r.category} photography book.`);
  if (r.light) L.push(`Light: ${r.light}`);
  if (r.lens) L.push(`Lens / depth: ${r.lens}`);
  if (r.grade) L.push(`Colour grade: ${r.grade}`);
  if (r.surfaces?.length) L.push(`Surfaces / sets: ${r.surfaces.join(", ")}`);
  if (r.composition) L.push(`Composition: ${r.composition}`);
  if (r.signatures?.length) L.push(`Signature moves (always): ${r.signatures.join("; ")}`);
  if (!L.length && !r.neverDo?.length) return undefined;
  const never = r.neverDo?.length ? `\nNEVER DO (hard — these break the brand): ${r.neverDo.join("; ")}.` : "";
  return `★ THE BRAND'S PHOTOGRAPHIC RULEBOOK — read off their OWN photos; every shot must obey it so it could sit unnoticed in their real feed:\n${L.join("\n")}${never}`;
}
