export interface PaletteColor { name: string; hex: string; role?: string; material?: string; }

/**
 * The deterministic finishing grade — the numeric LUT applied by sharp AFTER the model,
 * so the final colour never comes from the image model and a whole set reads as one
 * photographer's work. Derived from the brand's OWN photos (else a neutral filmic default);
 * kept gentle so it unifies the look without distorting product colour.
 */
export interface FinishGrade {
  rMul: number; gMul: number; bMul: number; // per-channel multipliers (~1.0, the brand's colour cast)
  saturation: number; // sharp modulate saturation (~0.9–1.1)
  brightness: number; // sharp modulate brightness (~0.97–1.03)
  contrast: number;   // S-curve slope around mid-grey (~1.0–1.12)
  grain: number;      // 0–1 subtle film grain amount
  sharpen: number;    // unsharp-mask sigma (~0.5–1.2)
}

/**
 * A brand's PHOTOGRAPHIC RULEBOOK — extracted by LOOKING at the brand's own photos
 * (not invented from adjectives). The rules the brand always follows, plus the list of
 * things they NEVER do. Fed to the planner as hard direction; the numeric colorGrade
 * drives the finishing pass. Category-aware (food shot by the food book, etc.).
 */
export interface PhotoRules {
  category?: string;     // the photography book this brand was read through (Food / Beverage / …)
  light?: string;        // their signature light — quality, direction, time of day
  lens?: string;         // lens / focal length / aperture / depth-of-field habit
  grade?: string;        // colour-grade look in words (warm-neutral, lifted blacks, muted greens…)
  surfaces?: string[];   // the surfaces & sets they actually shoot on
  composition?: string;  // crop / negative-space / placement habit
  signatures?: string[]; // the moves they ALWAYS make (their tells)
  neverDo?: string[];    // the hard "they never do this" list (category clichés + brand-specific)
  colorGrade?: FinishGrade; // numeric grade for the deterministic finishing pass
}

export interface BrandProfile {
  id: string;
  name: string;
  positioning?: string;
  audience?: string;
  palette?: PaletteColor[];
  typography?: {
    display?: { family?: string; weights?: string; tracking?: string };
    text?: { family?: string; weights?: string; tracking?: string };
  };
  rulebook?: Record<string, unknown>;
  doNot?: string[];
}

export type ShootMode = "product-photoshoot" | "model-photoshoot";

/**
 * Every creative output type the Asset Studio produces. product/model are the two
 * pipeline spines; instagram/story/carousel/ad are CREATIVE TYPES that ride the
 * product spine with their own planning directive, aspect(s), copy and presentation
 * (declarative specs in lib/creativeTypes.ts).
 */
export type CreativeTypeId = "product" | "model" | "instagram" | "story" | "carousel" | "ad";

/**
 * Campaign copy is DATA overlaid in the UI — never baked pixels — so a headline can
 * change on the spot without re-diffusing the image (and localization can
 * re-composite it later). Brushless rule: "change a headline … it updates on the spot".
 */
// How the headline + CTA are visually STAGED on an ad — chosen per campaign to match the
// brand's positioning, so the typography carries the same personality as the imagery
// (see the meta-ad-copy-typography guidance). Brand fonts are never swapped for generic
// families (brand-lock wins); the treatment controls the levers that DON'T break identity:
// placement, alignment, case, weight, hierarchy scale and CTA form.
// WHERE/HOW the type stages on the frame — free placement, never bottom-locked. Each id
// maps deterministically to positioned clusters in copyLayout.ts (both renderers agree).
export type CopyLayout =
  | "lower-third" // classic band along the bottom
  | "editorial-top" // small, refined headline up top; product breathes below
  | "mega" // oversized display headline anchored to an edge/corner, commands the frame
  | "split" // headline up top, CTA anchored at the bottom, product living in the gap
  | "side-rail" // headline + support as a vertical column railed down one side
  | "center"; // centered statement in the middle band

// 9-region fine anchor for the floating layouts (mega / editorial-top / center / side-rail).
export type CopyAnchor =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

// The palette-driven BACKGROUND the copy sits on — the "use the brand's colours as the
// background" lever. Sourced from the brand's OWN palette hexes so type never rides a bare
// dark/light scrim by default. "scrim" = today's legibility gradient over the photo; "band"
// = an edge-to-edge brand-colour strip behind the copy; "block" = a tight brand-colour box
// hugging the text; "canvas" = the whole frame becomes one brand-colour field (poster/text-led).
export type CopyBg = "scrim" | "band" | "block" | "canvas";

export interface CopyTreatment {
  headlineArchetype?: string; // e.g. "problem-solution", "luxury-minimal" — traceability
  ctaArchetype?: string; // e.g. "low-commitment", "exclusive"
  layout?: CopyLayout; // the composition the type stages in (free placement)
  anchor?: CopyAnchor; // fine placement for floating layouts
  placement?: "top" | "center" | "bottom"; // legacy vertical anchor (mapped to a layout when layout is absent)
  align?: "left" | "center" | "right"; // horizontal alignment
  case?: "upper" | "sentence" | "lower"; // headline capitalisation
  weight?: "regular" | "bold"; // headline weight emphasis
  scale?: "minimal" | "standard" | "impact" | "hero"; // hierarchy: minimal (luxury restraint) → hero (oversized display)
  ctaStyle?: "solid" | "outline" | "text-link"; // CTA visual form
  ink?: "light" | "dark"; // type colour for legibility over the scene (light default)
  fontId?: string; // chosen typeface from the font catalog ("brand" / undefined = brand's own pair)
  pinned?: boolean; // user took manual control of positioning → ignore the per-shot auto placement
  // ── Brand-palette background + explicit colours. Every colour is a resolved HEX (drawn from
  //    the brand palette) so the live overlay and the export bake agree without re-reading the
  //    brain. When any of these is set, the layout engine keeps type legible via a contrast pick.
  bg?: CopyBg; // background mode behind the copy (undefined → "scrim", today's behaviour)
  bgColor?: string; // brand-palette hex for band/block/canvas fills
  inkColor?: string; // explicit hex for headline/subline text (overrides light/dark ink)
  ctaBgColor?: string; // explicit hex for a solid CTA fill
  ctaInkColor?: string; // explicit hex for the CTA text
  // ── Manual fine-positioning: a fraction-of-frame offset the user nudges/drags the copy by,
  //    applied on top of the chosen layout/anchor so they can place type anywhere. Pins the run.
  nudge?: { x: number; y: number };
}

// Per-SHOT placement override — derived by analysing where THAT image has negative space,
// so copy sits in each frame's empty area (varied across a set) while the run treatment keeps
// the brand voice (case/weight/scale/CTA) consistent. Merged over the run treatment at render.
export type ShotPlacement = Pick<CopyTreatment, "layout" | "anchor" | "ink">;

export interface CampaignCopy {
  headline?: string;
  subline?: string;
  cta?: string;
  caption?: string;
  // Carousels tell ONE idea across swipes, so each frame carries its own on-image copy
  // (frame 1 hook → middle develop → last close/CTA). Index i = seq i+1. The top-level
  // headline/caption still describe the set (used for the feed caption + non-carousel).
  frames?: { headline?: string; subline?: string }[];
  // A SET of parallel options (e.g. "3 Instagram stories") — each option is its OWN complete
  // piece with DIFFERENT words. variants[i] belongs to shot i of the run. Distinct from
  // `frames` (a single sequence): variants never share a narrative, they must not repeat.
  variants?: { headline?: string; subline?: string; cta?: string; caption?: string }[];
  treatment?: CopyTreatment; // ad only — how the copy is staged (positioning-driven)
}

export interface CampaignOutput {
  id: string;      // shot id
  url: string;     // durable /api/img path
  format?: string; // placement (feed / square / story / landscape) for ad fan-outs
  aspect?: string; // aspect string the asset was made at
  angle?: string;  // the shot's angle / frame label
  seq?: number;    // carousel frame order (1-based)
  placement?: ShotPlacement; // image-aware copy placement for THIS frame
  at: string;      // ISO
}

/**
 * One brief's execution — the container grouping a multi-format / multi-frame set
 * (an ad fan-out, a carousel, an Instagram creative). Persisted per-brand in
 * campaigns.json, a SEPARATE file so saveBrain's shallow merge can never clobber it.
 */
export interface Campaign {
  id: string;
  name: string;
  type: CreativeTypeId;
  brief?: string; // the client's express request that made it
  copy?: CampaignCopy;
  outputs: CampaignOutput[];
  createdAt: string;
  updatedAt: string;
}

/** The accumulated knowledge about a brand — built by onboarding + research. */
export interface BrandResearch {
  summary?: string;
  essence?: string; // a sharp one-line positioning / brand line — the elevated articulation
  voice?: string; // tone-of-voice words (e.g. "warm, exact, unhurried")
  competitors?: string[];
  ambassadors?: string[];
  instagram?: string;
  website?: string;
  palette?: { hex: string; role?: string }[];
  aesthetic?: string;
  sources?: number;
  foundReal?: boolean; // true if a real brand with web presence was found, false if treated as new
  logo?: string; // the brand's logo image URL, harvested from their site
  productImages?: string[]; // the brand's REAL product photos, harvested from their site + kept for reuse
  products?: { name: string; image?: string }[]; // the full product catalogue (names + a hero image each), scraped from their site
  photoRules?: PhotoRules; // the brand's photographic rulebook, read off their own photos (light/lens/grade/surfaces/never-do)
}

/**
 * A single scraped product, rich enough to shoot from directly — no upload needed.
 * Harvested from the brand's own site (Shopify /products.json is the richest source).
 */
export interface StudioProduct {
  id: string;
  name: string;
  collection?: string;
  category?: string;
  description?: string;
  features?: string[];
  materials?: string[];
  variants?: string[];
  sizes?: string[];
  colours?: string[];
  price?: string;
  url?: string; // product page URL
  images: string[]; // every available product image
}

/**
 * The full Brand Intelligence dossier — the permanent Brand Brain surfaced on the
 * Intelligence page. A superset of BrandResearch, articulated for a creative director.
 * Every field optional so a partial research pass still renders cleanly.
 */
export interface BrandIntelligence {
  overview?: string;
  purpose?: string;
  mission?: string;
  vision?: string;
  story?: string;
  values?: string[];
  positioning?: string;
  audience?: string; // target audience
  persona?: string; // customer persona
  toneOfVoice?: string;
  copyPlaybook?: string; // rich copywriting guidance + signature lines — read ONLY by the copy generator, kept out of image prompts
  personality?: string[]; // brand personality traits
  palette?: { hex: string; role?: string }[];
  typography?: { display?: string; text?: string; note?: string };
  logo?: string; // logo image URL
  logoSystem?: string; // description of the logo system
  photographyStyle?: string;
  packagingStyle?: string;
  visualIdentity?: string;
  competitors?: { name: string; note?: string }[];
  social?: { platform: string; handle?: string; url?: string; note?: string }[];
  press?: { title: string; source?: string; url?: string }[];
  insights?: string[];
  campaigns?: { title: string; year?: string; channel?: string; description?: string; fronted?: string; url?: string }[]; // real past/current marketing campaigns (Meta Ad Library, Instagram, press)
  ambassadors?: { name: string; handle?: string; note?: string }[]; // the faces/creators/celebrities who represent the brand
  socialProof?: { type?: string; text: string; source?: string; url?: string }[]; // awards, press, follower scale, viral moments, endorsements, stockists
  website?: string;
  instagram?: string;
  sources?: number; // how many grounding sources informed this
  foundReal?: boolean;
  inferred?: boolean; // true when synthesized from model knowledge (no live grounding)
}

export interface BrandBrain {
  name?: string;
  category?: string;
  website?: string; // the site pasted in the Studio entry — the research source
  role?: string; // onboarding: the user's role (Founder, Brand owner, Creator …)
  brandType?: string; // onboarding: DTC / ecommerce, SaaS, Creator / personal …
  teamSize?: string; // onboarding: Just me, 2-5, 6-10, 11-50, 50+
  uses?: string[]; // onboarding: what they make — product/model shoots, carousels, ads, stories
  skippedResearch?: boolean; // true if they chose "Skip for now" on the entry
  audience?: string;
  vibe?: string;
  productType?: string;
  purpose?: string;
  ideology?: string; // values / point of view the brand stands for
  palette?: string; // user-stated colours / guidelines (e.g. "sage green, cream, charcoal")
  research?: BrandResearch;
  intelligence?: BrandIntelligence; // the full articulated Brand Brain (Asset Studio onboarding)
  catalog?: StudioProduct[]; // the full scraped product library
  selectedProductIds?: string[]; // which catalog products the user chose to shoot
  memory?: BrandMemory; // the "sharper every campaign" loop — what the founder kept/rejected
  ready?: boolean;
}

/**
 * One remembered shot decision — the WINNING (or rejected) art-direction, not the pixels.
 * The generated PNG is referenced by its durable /api/img path. Fed back into the planner
 * so future shoots lean toward what was kept and away from what was rejected.
 */
export interface ShotMemory {
  id: string;
  url: string; // the /api/img path — durable across sessions
  angle: string;
  prompt: string;
  negatives?: string[];
  panel?: Partial<PanelParams>;
  mode: ShootMode;
  decision: "keep" | "reject" | "hero";
  at: string; // ISO
}

/** Per-brand accumulated taste. Arrays are capped so the planner prompt stays bounded. */
export interface BrandMemory {
  approvedShots: ShotMemory[];
  rejectedShots: ShotMemory[];
  heroShots?: ShotMemory[];
  learnedPreferences?: string[]; // reserved: distilled natural-language taste (v2)
  updatedAt?: string;
}

/** The panel — every field optional; blanks fill from the Brand Profile. */
export interface PanelParams {
  background?: string;
  surface?: string;
  vibe?: string;
  composition?: string;
  lighting?: string;
  styling?: string;
  format?: string;
  include?: string;
  numAngles?: number; // how many DISTINCT camera angles
  shotsPerAngle?: number; // how many shots (variations) PER angle → total = numAngles × shotsPerAngle
}

/**
 * The model in a model-photoshoot. Either built from attributes (every field
 * optional, blanks fill from the brand), or reproduced from a pasted reference.
 */
export interface ModelSpec {
  source: "build" | "reference";
  gender?: string; // Woman / Man / Non-binary / Androgynous
  ageRange?: string; // e.g. "20s", "30s", "40s", "50s+"
  ethnicity?: string; // descriptor — South Asian, East Asian, Black, Latina, White, Middle Eastern, Mixed…
  skinTone?: string; // Fair / Light / Medium / Olive / Tan / Deep / Dark
  hairColor?: string;
  hairStyle?: string; // length + texture, e.g. "Long, wavy"
  eyes?: string; // eye colour
  bodyType?: string; // Slim / Athletic / Curvy / Plus / Tall / Petite
  vibe?: string; // model energy — Editorial / Girl-next-door / High-fashion / Sporty …
  expression?: string; // Serene / Soft smile / Confident / Candid laugh
  productUse?: string; // how the product is used — Worn / Held / Applied / In-context / None
}

/**
 * One person in a multi-model shoot (3–4 distinct people in one frame). Additive to the
 * single `model` field: when `models` has ≥2 entries the renderer builds a per-person
 * identity lock; a single person still flows through the original `model` / `modelRefs` path.
 */
export interface ModelPerson {
  id?: string;
  name?: string;             // display / prompt label, e.g. "Ava" or "Person 1"
  source: "build" | "reference";
  refs?: string[];           // pasted reference photo(s) of THIS specific person
  spec?: ModelSpec;          // built attributes for THIS person (when source: "build")
  productUse?: string;       // optional per-person interaction; else the shared one applies
}

/** Both the panel and the express prompt resolve to this. */
export interface ResolvedBrief {
  mode: ShootMode;
  express?: string;
  panel?: PanelParams;
  products: string[]; // data URLs / paths of uploaded product images (optional in model mode)
  productInfo?: StudioProduct[]; // the SELECTED products in full (name + ALL images + facts) — used to lock identity, pass front+back panels, and enrich the on-pack manifest; falls back to `products` when absent
  references?: string[]; // optional style/look references to match
  modelRefs?: string[]; // model-photoshoot: pasted reference photo(s) of the person to reproduce
  model?: ModelSpec; // model-photoshoot: the built/curated model
  models?: ModelPerson[]; // model-photoshoot: 3–4 DISTINCT people in one frame (overrides `model`/`modelRefs` when length ≥ 2)
  brand?: BrandBrain; // the learned brand brain, used as the generation's brand context
  compliance?: ShotCompliance; // carried back on a reshoot/resize so stored rules re-apply
  creativeType?: CreativeTypeId; // instagram/story/carousel/ad — absent = plain product/model shoot (byte-for-byte today's behaviour)
  companions?: CreativeTypeId[]; // ALSO produce these v2 types from this one action (e.g. a product shoot that also yields stories + posts), sharing the pre-passes
  frames?: number; // carousel: how many frames in the sequence
  formats?: string[]; // ad: placements to fan the one concept out to (lib/creativeTypes FORMATS keys)
  campaignName?: string; // optional name for the persisted campaign
  copy?: CampaignCopy; // client-typed copy overrides (headline / CTA) — win over the generated copy
  redo?: boolean; // this run is a SATISFACTION redo/refine of one already-paid shot — free, not charged (see lib/meals FREE_REDOS_PER_SHOT)
}

export interface PlannedShot { angle: string; prompt: string; negatives?: string[]; }
export interface ShootPlan { angles: string[]; shots: PlannedShot[]; qc: string[]; }

/**
 * Compliance minted at generate time and STAMPED onto every shot so brand do-not /
 * product-lock / brand-lock rules RIDE WITH THE ASSET — re-injected on every reshoot,
 * edit, relight and resize, instead of only gating the first planner prompt.
 */
export interface ShotCompliance {
  doNot: string[];       // brand do-not ∪ industry-playbook negatives ∪ this shot's plan negatives
  productLock: string;   // the intent that the real product (or model likeness) is reproduced exactly
  brandLock: string[];   // palette hexes + aesthetic + observed product colours to stay within
  appliedAt: string;     // ISO — when these rules were last (re)applied
}

export interface GeneratedShot {
  id: string;
  angle: string;
  prompt: string;
  url: string;
  negatives?: string[];
  locked?: boolean;
  decision?: "keep" | "reject" | "hero" | "neutral";
  compliance?: ShotCompliance;
  qc?: { pass: boolean; reasons?: string[] };
  format?: string; // ad fan-out placement this render targets
  seq?: number; // carousel frame order (1-based)
  groupId?: string; // groups fan-out siblings / carousel frames into one set
}
