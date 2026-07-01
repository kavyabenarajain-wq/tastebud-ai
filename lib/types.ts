export interface PaletteColor { name: string; hex: string; role?: string; material?: string; }

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

/** Both the panel and the express prompt resolve to this. */
export interface ResolvedBrief {
  mode: ShootMode;
  express?: string;
  panel?: PanelParams;
  products: string[]; // data URLs / paths of uploaded product images (optional in model mode)
  references?: string[]; // optional style/look references to match
  modelRefs?: string[]; // model-photoshoot: pasted reference photo(s) of the person to reproduce
  model?: ModelSpec; // model-photoshoot: the built/curated model
  brand?: BrandBrain; // the learned brand brain, used as the generation's brand context
  compliance?: ShotCompliance; // carried back on a reshoot/resize so stored rules re-apply
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
}
