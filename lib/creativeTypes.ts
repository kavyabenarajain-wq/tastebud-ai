import type { CreativeTypeId, ShootMode } from "./types";

/**
 * Declarative specs for the Asset Studio's creative types — the brushless.ai port
 * ("one brief in → every placement out"). Each v2 type (instagram / story / carousel /
 * ad) rides the PRODUCT pipeline spine unchanged and differs only in what's declared
 * here: the planning directive appended to the art-director brief, the fixed output
 * aspect(s), whether copy (headline/CTA/caption) is written alongside, and — for ad
 * campaigns — the placements one concept fans out to at generate time.
 *
 * Pure data, no I/O — safe to import from client components and API routes alike.
 */

export type FormatId = "feed" | "square" | "story" | "landscape";

export interface CreativeFormat {
  id: FormatId;
  label: string; // menu / badge label
  short: string; // compact card badge
  aspect: string; // renderer aspect string
}

/** The Instagram/Meta placements an ad concept fans out to (and any keeper adapts to). */
export const FORMATS: Record<FormatId, CreativeFormat> = {
  feed: { id: "feed", label: "Feed 4:5", short: "Feed", aspect: "4:5" },
  square: { id: "square", label: "Square 1:1", short: "Square", aspect: "1:1" },
  story: { id: "story", label: "Story 9:16", short: "Story", aspect: "9:16" },
  landscape: { id: "landscape", label: "Landscape 16:9", short: "Wide", aspect: "16:9" },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export const formatAspect = (id: string): string => FORMATS[id as FormatId]?.aspect ?? "4:5";

export interface CreativeTypeSpec {
  id: CreativeTypeId;
  label: string; // filter-bar chip
  runLabel: string; // canvas section heading + campaign fallback name
  blurb: string; // control-column one-liner
  mode: ShootMode; // which pipeline spine it rides
  aspect?: string; // fixed output aspect — the panel's format field is hidden for these
  frames?: { min: number; def: number; max: number }; // carousel sequence length
  needsCopy?: boolean; // write headline/CTA/caption alongside the shots (overlay data, never baked)
  fanOutFormats?: FormatId[]; // ad: default placements the one concept fans out to
  directive?: string; // type craft appended to the art-director brief (carousel builds its own — see carouselDirective)
}

const IG_DIRECTIVE =
  "INSTAGRAM CREATIVE — this frame is judged mid thumb-scroll: it must STOP THE SCROLL at first glance. " +
  "One bold, single-minded editorial idea — striking colour or light, real texture, a real place — never a bland catalogue packshot. " +
  "Compose with INTENTIONAL NEGATIVE SPACE in the top or bottom third where a caption overlay could sit. " +
  "Render the photograph CLEAN: absolutely no text, headline, logo, UI or border baked into the image — copy is overlaid later as real typography.";

const STORY_DIRECTIVE =
  "INSTAGRAM STORY — a full-bleed 9:16 VERTICAL frame, composed FOR the vertical: the product large and low-to-centre with real environmental depth above it, never a landscape idea awkwardly cropped tall. " +
  "SAFE ZONES ARE HARD: keep the TOP ~15% and BOTTOM ~20% of the frame free of the product and any key detail — the profile ring, reply bar and CTA UI live there. " +
  "Render the photograph CLEAN: no text, UI, borders or countdown stickers baked in — overlays come later.";

const AD_DIRECTIVE =
  "AD CAMPAIGN — ONE hero campaign concept built to convert: the kind of frame that runs PAID on Instagram and Meta. " +
  "Choose the single STRONGEST concept for this brand and brief and commit to it — bold product presence, one clear focal idea, real light and a real place, instantly legible at feed size on a phone. " +
  "Compose with clean negative space in the top or bottom third where the headline and CTA will be OVERLAID as real typography later. " +
  "The photograph itself renders CLEAN — absolutely no text, headline, button, badge or logo baked into the image.";

/** The carousel directive is built per-run because it teaches the narrative arc for exactly N frames. */
export function carouselDirective(n: number): string {
  return (
    `CAROUSEL — one idea told across ${n} swipes. This is a SEQUENCE, not ${n} disconnected images: design ONE scene world (same set, same palette, same light, same grade) and carry it through every frame so swiping feels continuous — one shoot, one story. ` +
    `Frame 1 is the HOOK: the boldest, most scroll-stopping frame of the set — it is the cover and earns the swipe. ` +
    `The middle frames DEVELOP the idea — a closer texture or material moment, the product in use or in context, an ingredient or detail study — each a genuinely different composition and distance, never a near-duplicate. ` +
    `The FINAL frame is the CLOSE: a calm, resolved full-product frame with generous negative space where a call-to-action overlay could sit. ` +
    `Label every shot "Frame k — role" (e.g. "Frame 1 — Hook"). Render every frame CLEAN — no text, numbers, arrows or UI baked in.`
  );
}

export const CREATIVE_TYPES: Record<CreativeTypeId, CreativeTypeSpec> = {
  product: {
    id: "product",
    label: "Product",
    runLabel: "Product Photo Shoots",
    blurb: "Editorial product photography from your uploaded product.",
    mode: "product-photoshoot",
  },
  model: {
    id: "model",
    label: "Model",
    runLabel: "Model Photoshoot",
    blurb: "On-model photography — build a model or reproduce yours.",
    mode: "model-photoshoot",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    runLabel: "Instagram Creative",
    blurb: "A scroll-stopping organic feed frame, 4:5, caption written for you.",
    mode: "product-photoshoot",
    aspect: "4:5",
    needsCopy: true,
    directive: IG_DIRECTIVE,
  },
  story: {
    id: "story",
    label: "Story",
    runLabel: "Story",
    blurb: "A full-bleed 9:16 vertical with the story safe-zones respected.",
    mode: "product-photoshoot",
    aspect: "9:16",
    needsCopy: true,
    directive: STORY_DIRECTIVE,
  },
  carousel: {
    id: "carousel",
    label: "Carousel",
    runLabel: "Carousel",
    blurb: "One idea told across swipes — hook, story, close — in one scene world.",
    mode: "product-photoshoot",
    aspect: "4:5",
    frames: { min: 3, def: 5, max: 8 },
    needsCopy: true,
  },
  ad: {
    id: "ad",
    label: "Ad campaign",
    runLabel: "Ad Campaign",
    blurb: "One concept fanned across every placement, headline and CTA written for you.",
    mode: "product-photoshoot",
    needsCopy: true,
    fanOutFormats: ["feed", "square", "story", "landscape"],
    directive: AD_DIRECTIVE,
  },
};

/** The v2 creative types — everything that isn't one of the two original spines. */
export function isV2Type(t?: string): t is Exclude<CreativeTypeId, "product" | "model"> {
  return t === "instagram" || t === "story" || t === "carousel" || t === "ad";
}
