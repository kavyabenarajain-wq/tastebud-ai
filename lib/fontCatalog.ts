/**
 * FONT CATALOG — a curated gallery of type pairings the user can pick to overlay copy on
 * a creative (instagram / story / carousel / ad). The brand's own resolved pair is always
 * offered first; these are the "explore beyond the brand" alternatives.
 *
 * Every family is a free, license-clean Google Font that BOTH consumers can load:
 *   • client → one <link> (catalogFontHref) loads them all so any pick renders instantly
 *   • server → satori fetches the TTF per family+weight (loadFontData) to bake the export
 *
 * A choice is a DISPLAY face (headline) + a TEXT face (subline / CTA), mirroring BrandFonts,
 * so resolving one just hands the overlay + export the same shape they already speak.
 */

import { makeFont, type BrandFonts, type ResolvedFont } from "./brandFont";

export interface FontChoice {
  id: string;
  name: string; // short label shown on the chip
  vibe: string; // one-word feel, for the title tooltip
  display: { family: string; category: ResolvedFont["category"]; weight: number; tracking: string };
  text: { family: string; category: ResolvedFont["category"]; weight: number; tracking: string };
}

export const BRAND_FONT_ID = "brand";

// The actual weights each family ships on Google Fonts. The client <link> must request ONLY
// real weights (css2 4xx's on a weight a static face lacks, which would kill the whole
// stylesheet). Everything here is variable/multi-weight except Space Mono (400/700 only).
const FAMILY_WEIGHTS: Record<string, number[]> = {
  "Space Mono": [400, 700],
};
const DEFAULT_WEIGHTS = [400, 500, 600, 700];

/**
 * Ten distinct directions, broad enough to restyle almost any brand's creative: refined
 * editorial, high-fashion contrast, modern grotesk, old-world luxe, clean geometric,
 * long-form reader, tall condensed, soft rounded, indie mono, grand couture.
 */
export const FONT_CHOICES: FontChoice[] = [
  { id: "editorial", name: "Editorial", vibe: "refined serif",
    display: { family: "Fraunces", category: "serif", weight: 600, tracking: "-0.02em" },
    text: { family: "Work Sans", category: "sans", weight: 400, tracking: "0em" } },
  { id: "fashion", name: "Fashion", vibe: "high-contrast couture",
    display: { family: "Playfair Display", category: "display", weight: 700, tracking: "-0.01em" },
    text: { family: "Montserrat", category: "sans", weight: 400, tracking: "0.02em" } },
  { id: "grotesk", name: "Grotesk", vibe: "modern swiss",
    display: { family: "Space Grotesk", category: "sans", weight: 600, tracking: "-0.01em" },
    text: { family: "Inter", category: "sans", weight: 400, tracking: "0em" } },
  { id: "luxe", name: "Luxe", vibe: "old-world elegance",
    display: { family: "Cormorant Garamond", category: "serif", weight: 600, tracking: "-0.005em" },
    text: { family: "Jost", category: "sans", weight: 400, tracking: "0.04em" } },
  { id: "geometric", name: "Geometric", vibe: "clean minimal",
    display: { family: "Poppins", category: "sans", weight: 600, tracking: "-0.01em" },
    text: { family: "Poppins", category: "sans", weight: 400, tracking: "0em" } },
  { id: "reader", name: "Reader", vibe: "long-form editorial",
    display: { family: "Newsreader", category: "serif", weight: 600, tracking: "-0.01em" },
    text: { family: "Mulish", category: "sans", weight: 400, tracking: "0em" } },
  { id: "condensed", name: "Condensed", vibe: "tall poster impact",
    display: { family: "Oswald", category: "display", weight: 600, tracking: "0.01em" },
    text: { family: "Inter", category: "sans", weight: 400, tracking: "0em" } },
  { id: "rounded", name: "Rounded", vibe: "soft & friendly",
    display: { family: "Quicksand", category: "sans", weight: 600, tracking: "-0.005em" },
    text: { family: "Nunito", category: "sans", weight: 400, tracking: "0em" } },
  { id: "mono", name: "Mono", vibe: "indie utilitarian",
    display: { family: "Space Mono", category: "mono", weight: 700, tracking: "-0.02em" },
    text: { family: "DM Sans", category: "sans", weight: 400, tracking: "0em" } },
  { id: "grand", name: "Grand", vibe: "couture statement",
    display: { family: "Cormorant Garamond", category: "serif", weight: 700, tracking: "-0.01em" },
    text: { family: "Montserrat", category: "sans", weight: 400, tracking: "0.06em" } },
];

const byId = new Map(FONT_CHOICES.map((c) => [c.id, c]));

/** A FontChoice → the BrandFonts shape the overlay + export already consume. */
export function fontChoiceToBrandFonts(c: FontChoice): BrandFonts {
  return {
    display: makeFont(c.display.family, c.display.category, c.display.weight, c.display.tracking),
    text: makeFont(c.text.family, c.text.category, c.text.weight, c.text.tracking),
  };
}

/**
 * Resolve a treatment's chosen `fontId` to a real font pair. Falls back to the brand's own
 * resolved fonts when nothing (or "brand") is chosen — so an untouched creative stays on brand.
 */
export function resolveFontChoice(fontId: string | undefined, brandFonts: BrandFonts): BrandFonts {
  if (!fontId || fontId === BRAND_FONT_ID) return brandFonts;
  const c = byId.get(fontId);
  return c ? fontChoiceToBrandFonts(c) : brandFonts;
}

/** One Google Fonts stylesheet URL that loads EVERY catalog family (client <link>). */
export function catalogFontHref(): string {
  const fams = new Set<string>();
  for (const c of FONT_CHOICES) { fams.add(c.display.family); fams.add(c.text.family); }
  const parts = [...fams].map((fam) => {
    const ws = (FAMILY_WEIGHTS[fam] ?? DEFAULT_WEIGHTS).join(";");
    return `family=${encodeURIComponent(fam)}:wght@${ws}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}
