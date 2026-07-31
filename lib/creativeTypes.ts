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
  "NO AI-STAGING CLICHES: no product floating on a pedestal/plinth, no seamless gradient void, no concentric spotlight halo, no scattered cubes or pebbles, no fake confetti bokeh, no plastic CGI render — a real camera, real light, a real surface. " +
  "COPY SAFE ZONE (non-negotiable): reserve a CLEAN, UNCLUTTERED BAND across either the TOP third OR the BOTTOM third as genuine EMPTY negative space for an overlaid headline/caption. Keep the product AND every key detail ENTIRELY OUT of that band — let the product command the opposite two-thirds boldly (do not shrink it) so the reserved band stays deliberate calm space the type can sit on WITHOUT ever touching or overlapping the product. " +
  "Render the photograph CLEAN: absolutely no text, headline, logo, UI or border baked into the image — copy is overlaid later as real typography.";

const STORY_DIRECTIVE =
  "INSTAGRAM STORY — a full-bleed 9:16 VERTICAL frame, composed FOR the vertical: the product large and low-to-centre with real environmental depth above it, never a landscape idea awkwardly cropped tall. " +
  "PLATFORM UI SAFE ZONES ARE HARD: keep the TOP ~15% and BOTTOM ~20% of the frame free of the product and any key detail — the profile ring, reply bar and CTA UI live there. " +
  "COPY SAFE ZONE (separate from the UI zones, non-negotiable): this story carries an OVERLAID headline and CTA, so reserve a CLEAN, UNCLUTTERED band of genuine EMPTY negative space for it — either the upper-middle (just below the top 15%) OR the lower-middle (just above the bottom 20%) — and keep the product and every key detail ENTIRELY OUT of it so the type never lands on the product. " +
  "Render the photograph CLEAN: no text, UI, borders or countdown stickers baked in — overlays come later.";

const AD_DIRECTIVE =
  "AD CAMPAIGN — ONE hero campaign concept built to convert: the kind of frame that runs PAID on Instagram and Meta. " +
  "Choose the single STRONGEST concept for this brand and brief and commit to it — bold product presence, one clear focal idea, motivated real light and a real place, instantly legible at thumbnail size on a phone. " +
  "MULTI-PLACEMENT (critical): this ONE concept is rendered natively at several aspect ratios from this single brief — portrait 4:5, square 1:1 and vertical 9:16 — so compose it ASPECT-ROBUST: keep the product and the hero moment CENTRED within the middle ~60% of the frame with generous breathing room on every side, so nothing essential is lost whether the frame is squared or tall, and never park the subject at one edge. " +
  "COPY SAFE ZONE (non-negotiable): reserve a CLEAN, UNCLUTTERED BAND across the BOTTOM third as genuine EMPTY negative space for the OVERLAID headline and CTA, and keep the extreme TOP ~12% clear too so the band survives the vertical crop — keep the product and every key detail fully OUT of the reserved band so the type never touches the product; let the product command its two-thirds boldly, but do not run it edge-to-edge through the band. " +
  "NO AI-STAGING CLICHES: no product floating on a pedestal/plinth/podium, no seamless gradient void, no concentric spotlight halo, no scattered geometric cubes or pebbles, no fake confetti bokeh, no plastic CGI sheen — a real camera in a real place. " +
  "The photograph itself renders CLEAN — absolutely no text, headline, button, badge or logo baked into the image.";

/** The carousel directive is built per-run because it teaches the narrative arc for exactly N frames. */
export function carouselDirective(n: number): string {
  return (
    `CAROUSEL — one idea told across ${n} swipes. This is a SEQUENCE, not ${n} disconnected images: design ONE scene world (same set, same palette, same light, same grade) and carry it through every frame so swiping feels continuous — one shoot, one story. ` +
    `Frame 1 is the HOOK: the boldest, most scroll-stopping frame of the set — it is the cover and earns the swipe. ` +
    `The middle frames DEVELOP the idea as an ESCALATING sequence — each a genuinely different composition, distance and subject from its neighbours, never a near-duplicate. Walk distinct beats IN ORDER: a macro texture/material moment → the product in-use, category-correct (eaten, sipped, worn or applied — never worn-as-food) → the product in its real environment/context → an ingredient, component or detail study. Use as many distinct beats as there are middle frames; if the frames outnumber the beats, change angle, height and scale so no two middles rhyme. ` +
    `The FINAL frame is the CLOSE: a calm, resolved full-product frame. ` +
    `COPY SAFE ZONE (non-negotiable): EVERY frame carries overlaid text, so on EVERY frame reserve a CLEAN, UNCLUTTERED BAND in the SAME position across the whole set — pick the TOP third OR the BOTTOM third once and keep it consistent for continuity — as genuine EMPTY negative space for that frame's overlaid copy. Keep the product and every key detail ENTIRELY OUT of that band so the type never overlaps the product; do NOT let the product fill the frame on any frame. ` +
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
    // The three Meta paid workhorses. 16:9 landscape is letterboxed/near-deprecated in feed and
    // forces the one planned concept into its worst crop — a wasted Meal. Still available via the
    // FORMATS table for keeper adaptation and honoured if the client explicitly requests it.
    fanOutFormats: ["feed", "square", "story"],
    directive: AD_DIRECTIVE,
  },
};

/** The v2 creative types — everything that isn't one of the two original spines. */
export function isV2Type(t?: string): t is Exclude<CreativeTypeId, "product" | "model"> {
  return t === "instagram" || t === "story" || t === "carousel" || t === "ad";
}
