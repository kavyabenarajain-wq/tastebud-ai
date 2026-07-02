import { z } from "zod";
import { complete, extractJson } from "./llm";
import { chatCreate } from "./openaiClient";
import { researchBrand } from "./research";
import type { BrandBrain, BrandResearch } from "./types";

/**
 * The Back-Brain — an INTERNAL-ONLY agent (operator tool, never customer-facing).
 *
 * Flow: paste the founder's 30-min call notes + Notion answers  →  extract a brief
 *  →  research the sector + current trends (Gemini grounding)  →  synthesise a full
 *  brand-guidelines spec (strategist + designer)  →  render a self-contained,
 *  on-brand HTML presentation that mirrors the reference deck's exact design system:
 *  alternating dark / cream grounds, a gold Didone section title on the left + short
 *  structured body on the right, white panel rows, swatch grids and type specimens.
 *
 * The deck's chrome (dark / cream / gold) is drawn from the brand's OWN palette so it
 * stays on-brand, while the layout, typography and structure match the reference 1:1.
 */

// ── Spec shape ───────────────────────────────────────────────────────────────
const Row = z.object({ title: z.string().default(""), sub: z.string().default(""), body: z.string().default("") });
const Swatch = z.object({ name: z.string(), hex: z.string(), role: z.string().default(""), meaning: z.string().default("") });
const Font = z.object({ name: z.string(), role: z.string().default(""), note: z.string().default("") });
const ScaleStep = z.object({ name: z.string(), spec: z.string().default(""), use: z.string().default("") });
const NamedBody = z.object({ title: z.string().default(""), body: z.string().default("") });

const GuidelinesSchema = z.object({
  brandName: z.string(),
  monogram: z.string().default(""),
  tagline: z.string().default(""),
  category: z.string().default(""),
  isApparel: z.boolean().default(false),

  // narrative
  mission: z.string().default(""),
  vision: z.string().default(""),
  positioning: z.string().default(""),
  purpose: z.string().default(""),
  manifesto: z.array(z.string()).default([]),
  identityIntro: z.array(z.string()).default([]),
  world: z.array(Row).default([]),         // 3-4 brand attributes (panel)
  statement: z.array(z.string()).default([]),
  beliefs: z.array(Row).default([]),        // 3 beliefs (panel)
  quotes: z.array(z.string()).default([]),  // short centered quotes

  // logo
  logo: z.object({
    concept: z.array(z.string()).default([]),
    colorNote: z.string().default(""),
    variations: z.array(z.object({ name: z.string(), use: z.string().default("") })).default([]),
    safety: z.array(z.string()).default([]),
    donts: z.array(z.string()).default([]),
  }).default({}),

  // colour
  color: z.object({
    philosophy: z.array(z.string()).default([]),
    palette: z.array(Swatch).default([]),
    hierarchy: z.array(Row).default([]),
  }).default({}),

  // typography
  typography: z.object({
    philosophy: z.array(z.string()).default([]),
    displayFont: z.string().default("Bodoni Moda"),
    sansFont: z.string().default("Jost"),
    fonts: z.array(Font).default([]),
    scale: z.array(ScaleStep).default([]),
    rules: z.array(z.string()).default([]),
    inUse: z.array(Row).default([]),
  }).default({}),

  // story / motifs
  intentIntro: z.array(z.string()).default([]),
  patternStory: NamedBody.optional(),
  heroStory: NamedBody.optional(),

  // systems
  waxSeal: z.object({ concept: z.array(z.string()).default([]) }).nullable().default(null),
  patternSystem: z.array(z.string()).default([]),
  photography: z.object({
    philosophy: z.array(z.string()).default([]),
    inUse: z.array(Row).default([]),
  }).default({}),
  applications: z.array(z.object({ label: z.string(), slots: z.number().default(3) })).default([]),
  intent: z.array(z.string()).default([]),
});

export type GuidelinesSpec = z.infer<typeof GuidelinesSchema>;

const BriefSchema = z.object({
  name: z.string().default(""),
  category: z.string().default(""),
  audience: z.string().default(""),
  vibe: z.string().default(""),
  productType: z.string().default(""),
  mission: z.string().default(""),
  vision: z.string().default(""),
  purpose: z.string().default(""),
  positioning: z.string().default(""),
  statedColors: z.string().default(""),
  statedFonts: z.string().default(""),
  beliefs: z.string().default(""),
  notesDigest: z.string().default(""),
  isApparel: z.boolean().default(false),
});
export type Brief = z.infer<typeof BriefSchema>;

// A vision read of the client's brand REFERENCE images (logo / palette / type samples / moodboard)
// for a rebrand — pulls the real hex codes, the type & logo feel and the overall aesthetic so the
// deck is co-created FROM what they actually supplied. Best-effort: "" if no images / no vision model.
async function analyzeReferences(images: string[]): Promise<string> {
  const imgs = (images ?? []).filter((u) => typeof u === "string" && /^data:image\//i.test(u)).slice(0, 6);
  if (!imgs.length || !(process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY)) return "";
  try {
    const content = [
      { type: "text", text:
        "These are brand REFERENCE images a client supplied for a REBRAND — a logo, colour palette, type samples or moodboard. " +
        "In 4-7 tight lines read out ONLY what you actually see: " +
        "(1) COLOUR PALETTE as concrete hex codes, each with a role (primary / secondary / accent / neutral); " +
        "(2) TYPOGRAPHY — the feel and any identifiable typefaces (serif / grotesque / humanist, weight, character); " +
        "(3) LOGO — the mark type and its concept if a logo appears; (4) overall AESTHETIC in a phrase." },
      ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const r = await chatCreate({ max_completion_tokens: 700, messages: [{ role: "user", content }] } as never);
    return r.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

// The block that carries what the client gave for logo/font/type/palette (pasted notes + the vision
// digest of any uploaded reference images) into the brief + guidelines prompts.
function referenceContext(referenceDigest?: string): string {
  if (!referenceDigest?.trim()) return "";
  return `\n\nCLIENT-SUPPLIED REFERENCES for the new identity (logo / fonts / typography / colour palette) — treat the hex codes and typefaces here as the INTENDED palette & type to build the guidelines around:\n${referenceDigest.trim()}\n`;
}

// ── 1. Extract a structured brief from pasted call notes + Notion answers ─────
export async function extractBrief(notes: string, brandName?: string, exBranding?: string, referenceDigest?: string): Promise<Brief> {
  const system =
    `You are a brand strategist reading raw intake — a founder call transcript and their answers to a brand questionnaire. ` +
    `Extract ONLY what the founder actually said or clearly implied; never invent facts. Leave a field blank if it is genuinely absent. ` +
    `Capture any colours, fonts, or aesthetic references they named verbatim into statedColors / statedFonts. ` +
    `notesDigest = a tight 4-6 sentence digest of everything distinctive about this brand (story, founder intent, edge, audience truth). ` +
    `isApparel = true only if they sell clothing / wearables / physical goods that could carry a woven label or wax seal. ` +
    `Return STRICT JSON ONLY with keys: name, category, audience, vibe, productType, mission, vision, purpose, positioning, statedColors, statedFonts, beliefs, notesDigest, isApparel.`;
  const user = `${brandName ? `Brand name (operator-supplied): ${brandName}\n\n` : ""}${exBranding ? `EXISTING BRANDING — the brand is REBRANDING; this is their CURRENT identity, provided so you understand where they are today. Capture only equity worth carrying forward; the RAW INTAKE below describes where they want to GO. Do NOT treat this existing branding as the target.\n${exBranding.slice(0, 5000)}\n\n` : ""}RAW INTAKE:\n${notes}${referenceContext(referenceDigest)}${referenceDigest ? `\nCapture the referenced palette hex codes and fonts VERBATIM into statedColors / statedFonts.` : ""}`;
  const raw = await complete(system, user, 4000);
  try {
    const b = BriefSchema.parse(JSON.parse(extractJson(raw)));
    if (brandName && !b.name) b.name = brandName;
    return b;
  } catch {
    return BriefSchema.parse({ name: brandName ?? "", notesDigest: notes.slice(0, 800) });
  }
}

/**
 * Salvage candidates for a truncated JSON object so a cut-off model reply still yields a
 * usable (partial) spec — zod fills the rest. Two strategies, tried in order by the parser:
 *  A) close an open string as a value, then close every open array/object (handles the common
 *     case: truncation mid-value, e.g. inside "mission");
 *  B) cut back to the last comma at any depth, then close brackets (handles truncation in a key
 *     or a number). Returns both attempts.
 */
export function repairJson(raw: string): string[] {
  // strip a leading code fence but keep the (possibly unterminated) tail — do NOT slice to last "}".
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*)/i);
  const s = (fenced ? fenced[1] : raw).replace(/```\s*$/, "");
  const start = s.indexOf("{");
  if (start < 0) return [];
  let inStr = false, escaped = false, lastCommaLen = -1;
  const body = s.slice(start);
  // recompute state over the body
  const open: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") open.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") open.pop();
    else if (c === ",") lastCommaLen = i;
  }
  const closeAll = (str: string) => {
    const st: string[] = [];
    let q = false, e = false;
    for (const ch of str) {
      if (q) { if (e) e = false; else if (ch === "\\") e = true; else if (ch === '"') q = false; continue; }
      if (ch === '"') q = true; else if (ch === "{" || ch === "[") st.push(ch === "{" ? "}" : "]"); else if (ch === "}" || ch === "]") st.pop();
    }
    let res = q ? str + '"' : str.replace(/[\s,]*$/, ""); // close a dangling string value, else drop a trailing comma
    return res + st.reverse().join("");
  };
  const out: string[] = [];
  out.push(closeAll(body));                                   // A) close string + brackets
  if (lastCommaLen >= 0) out.push(closeAll(body.slice(0, lastCommaLen))); // B) drop dangling token
  return out;
}

function briefToBrain(b: Brief): BrandBrain {
  return {
    name: b.name, category: b.category, audience: b.audience, vibe: b.vibe,
    productType: b.productType, purpose: b.purpose || b.mission, palette: b.statedColors,
  };
}

// ── 2. Synthesise the full brand-guidelines spec ─────────────────────────────
/** Parse one model reply into a plain object — tolerant of truncation (extract + salvage). */
function parseObj(raw: string): Record<string, unknown> {
  for (const candidate of [extractJson(raw), ...repairJson(raw)]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* next */ }
  }
  return {};
}

/**
 * Build the spec from THREE smaller, parallel calls (narrative / logo+colour / type+systems)
 * instead of one huge JSON. Each reply is small enough that it can't truncate, removing the
 * root cause — and even if one part fails, the others still produce a deck (zod fills the rest).
 */
export async function buildGuidelines(brief: Brief, research: BrandResearch, exBranding?: string, referenceDigest?: string): Promise<GuidelinesSpec> {
  const persona =
    `You are a world-class brand strategist AND identity designer (Pentagram / Collins / Mucho level), writing CONTENT for a luxury brand-guidelines deck. ` +
    `Most brands here are pre-identity startups — where something is undecided, DECIDE it with taste and conviction. Anchor to any colours/fonts the founder stated. Carry INTENT everywhere (say WHY). ` +
    `BE ORIGINAL AND SPECIFIC — think out of the box. Avoid generic brand-speak ("premium quality", "customer-first"); write distinctive, evocative, ownable language that could ONLY belong to THIS brand, with a real point of view. ` +
    `WRITING RULES: structured and vivid, not thin. mission/vision/positioning = 1-2 sharp sentences; every "body" = 2-3 substantive sentences with a concrete detail; array paragraphs = 2-3 rich but tight paragraphs; specific over generic, never filler or padding. ` +
    `Lowercase 'sub' labels are shown UPPERCASE. Return STRICT, COMPACT JSON ONLY — no markdown, no prose, no fences.`;

  const context =
    `\n\nFOUNDER BRIEF:\n${JSON.stringify(brief)}\n\nSECTOR RESEARCH:\n` +
    `${JSON.stringify({ summary: research.summary, competitors: research.competitors, aesthetic: research.aesthetic, palette: research.palette })}\n\n` +
    (exBranding ? `REBRAND — this brand has an EXISTING identity (below) and wants to REBRAND. Honour the equity worth keeping (the name, and anything the founder explicitly insists on) but deliver a genuinely FRESH, elevated evolution — do NOT reproduce the old palette, type or voice unless the founder said to keep it. Design a considered step FORWARD from where they are today, not a restatement of it.\nEXISTING BRANDING:\n${exBranding.slice(0, 5000)}\n\n` : "") +
    (referenceDigest ? `${referenceContext(referenceDigest)}CO-CREATE FROM THESE REFERENCES — the client explicitly wants them reflected: build the colour section AROUND the referenced hex codes, honour the referenced typography, and evolve the logo per the reference. Do NOT invent an unrelated palette or typeface; where a reference is silent, decide with taste.\n\n` : "") +
    `Position the brand AGAINST the category (own a distinct space).`;

  const pNarrative =
    `${persona}\n\nReturn ONLY this JSON shape:\n` +
    `{"brandName","monogram"(2 initials),"tagline","category","isApparel"(bool),` +
    `"mission","vision","positioning","purpose",` +
    `"manifesto":[3 short paras],"identityIntro":[2 short paras],` +
    `"world":[3-4 {"title"(one word),"sub"(3 keywords),"body"(2 sentences)}],` +
    `"statement":[2 short paras],"beliefs":[3 {"title"(a belief),"sub"(3 keywords),"body"(2 sentences)}],` +
    `"quotes":[2 short punchy lines],"intentIntro":[1-2 short paras],"intent":[1-2 short paras]}` + context;

  const pLogoColour =
    `${persona}\n\nReturn ONLY this JSON shape:\n` +
    `{"logo":{"concept":[2-3 short lines — one clever, minimal, type-led idea + intent],"colorNote","variations":[3-4 {"name","use"}],"safety":[3 short rules],"donts":[5-6 short "Never ..." lines]},` +
    `"color":{"philosophy":[2 short paras],` +
    `"palette":[5-6 {"name","hex"(real hex),"role","meaning"(one line)}],` +
    `"hierarchy":[3 {"title"(STRUCTURE/ABUNDANCE/HIGHLIGHT),"sub"(which colours),"body"(2 sentences)}]}}\n` +
    `Make the palette CONFIDENT, distinctive and ownable — a signature combination that could only be this brand, not safe defaults; each colour earns its place and its "meaning" says what it expresses. The palette MUST include one near-dark colour whose role contains "ground", one near-light colour whose role contains "base", and one mid colour whose role contains "accent", plus 2-3 brand colours. If the founder stated colours, build around them (convert to hex).` + context;

  const pTypeSystems =
    `${persona}\n\nReturn ONLY this JSON shape:\n` +
    `{"typography":{"philosophy":[2 short paras],"displayFont"(exact Google Fonts family),"sansFont"(exact Google Fonts family),` +
    `"fonts":[2 {"name"(brand-facing),"role","note"}],"scale":[4 {"name"(H1/H2/H3/Body),"spec"(e.g. "Display · 60px · tracking +2% · line height 1.05"),"use"}],` +
    `"rules":[4-6 short spec lines],"inUse":[4 {"title","sub","body"}]},` +
    `"patternStory":{"title","body"},"heroStory":{"title","body"},` +
    `"waxSeal":${brief.isApparel ? `{"concept":[2-3 short lines]}` : `null`},` +
    `"patternSystem":[4-5 short spec lines: Scale/Opacity/Cropping/Layering/When to avoid],` +
    `"photography":{"philosophy":[3 short paras],"inUse":[4 {"title"(FRAMING/CROP/…),"sub"(short caption),"body"(2 sentences)}]},` +
    `"applications":[2-3 {"label"(e.g. "packaging ideas"),"slots":3}]}\n` +
    `FONTS — think out of the box: choose a DISTINCTIVE, brand-appropriate pairing from the full range of Google Fonts that fits THIS brand's exact personality (it could be a high-contrast Didone, a transitional or slab serif, a characterful grotesque, a humanist or geometric sans, even an editorial display face) — NOT a safe default. displayFont = the headline family, sansFont = the text family; both must be EXACT Google Fonts family names that genuinely pair well. Honour any stated fonts via the closest Google Fonts. ` +
    `In the two "fonts" entries, give the brand-facing name, its role, and a one-line note on WHY it fits this brand. heroStory only if a symbol/animal genuinely fits (else {"title":"","body":""}).` + context;

  const [a, b, c] = await Promise.all([
    complete(pNarrative, "Produce the JSON now.", 12000, { reasoningEffort: "low" }),
    complete(pLogoColour, "Produce the JSON now.", 12000, { reasoningEffort: "low" }),
    complete(pTypeSystems, "Produce the JSON now.", 12000, { reasoningEffort: "low" }),
  ]);

  return assembleGuidelines([a, b, c], brief.isApparel, brief.name);
}

/**
 * Coerce an LLM value into the plain string a string field expects. gpt-5.5 routinely
 * returns an OBJECT (or array) where a string belongs ({"text":"…"}, {"en":"…"}, a
 * {title,body} pair, etc.); raw zod then THROWS and — because the whole spec is parsed
 * as one block — collapses the entire deck to a 2-slide shell. Pull the text out instead.
 */
function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "value", "en", "body", "content", "description", "label", "name"]) {
      if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
    }
    return Object.values(o).filter((x) => typeof x === "string").join(" ");
  }
  return "";
}

/**
 * Shape any merged LLM blob to a zod schema BEFORE parsing: walk the schema, coerce
 * each leaf to the type it wants (string fields get toText, arrays map element-wise,
 * objects recurse). This salvages every good field instead of letting one malformed
 * one throw the whole parse — so a thin reply yields a thinner deck, never a 2-slide one.
 */
function coerceToSchema(schema: any, v: unknown): unknown {
  const def = schema?._def;
  const t = def?.typeName;
  if (t === "ZodDefault") return v === undefined ? undefined : coerceToSchema(def.innerType, v);
  if (t === "ZodOptional") return v == null ? undefined : coerceToSchema(def.innerType, v);
  if (t === "ZodNullable") return v == null ? null : coerceToSchema(def.innerType, v);
  if (t === "ZodCatch") return coerceToSchema(def.innerType ?? def.schema, v);
  if (t === "ZodString") return toText(v);
  if (t === "ZodNumber") return typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" && !Number.isNaN(+v) ? +v : undefined);
  if (t === "ZodBoolean") return typeof v === "boolean" ? v : undefined;
  if (t === "ZodArray") {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    return arr.map((el) => coerceToSchema(def.type, el)).filter((el) => el !== undefined);
  }
  if (t === "ZodObject") {
    const shape = def.shape();
    const src = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(shape)) {
      const cv = coerceToSchema(shape[k], src[k]);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }
  return v;
}

/** Merge the (possibly partial/truncated) group replies into one validated spec. Exported for tests. */
export function assembleGuidelines(parts: string[], isApparel: boolean, fallbackName = "Brand"): GuidelinesSpec {
  const merged: Record<string, unknown> = Object.assign({}, ...parts.map(parseObj));
  if (!isApparel) merged.waxSeal = null;
  if (merged.heroStory && typeof merged.heroStory === "object" && !(merged.heroStory as any).title) merged.heroStory = undefined;

  // Coerce to the schema first (object-where-string etc.), so a single bad field can't
  // throw away the whole deck. Per-field fallback below catches anything coercion misses.
  const coerced = coerceToSchema(GuidelinesSchema, merged) as Record<string, unknown>;

  let spec: GuidelinesSpec;
  const whole = GuidelinesSchema.safeParse(coerced);
  if (whole.success) {
    spec = whole.data;
  } else {
    // Last-resort salvage: parse field-by-field so good fields survive a stray bad one.
    const shape = (GuidelinesSchema as any)._def.shape() as Record<string, any>;
    const salvaged: Record<string, unknown> = { brandName: toText(coerced.brandName) || fallbackName || "Brand" };
    for (const k of Object.keys(shape)) {
      if (k === "brandName") continue;
      const r = shape[k].safeParse((coerced as any)[k]);
      if (r.success && r.data !== undefined) salvaged[k] = r.data;
    }
    spec = GuidelinesSchema.parse(salvaged);
  }
  if (!spec.brandName) spec.brandName = fallbackName || "Brand";
  if (!spec.monogram) spec.monogram = (spec.brandName.match(/\b[A-Za-z]/g) || ["B"]).slice(0, 2).join("").toUpperCase();
  return spec;
}

// Pull a concrete colour palette (hex + role + name) out of the client's reference notes / vision
// digest, so the deck can be LOCKED to exactly those colours ("use the palette colours only").
function parseProvidedPalette(text?: string): Swatch_[] {
  if (!text) return [];
  const out: Swatch_[] = [];
  const seen = new Set<string>();
  const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
  const clean = (s: string) =>
    s.replace(/\b(primary|secondary|tertiary|accent|neutral|base|background|ink|dark|light|colou?rs?|hex|palette)\b/gi, " ")
      .replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < 8) {
    const hex = norm(m[0]);
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Look at the words just around the hex for a role + a human name.
    const before = text.slice(Math.max(0, m.index - 34), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 26);
    const roleM = (before + " " + after).match(/\b(primary|secondary|tertiary|accent|neutral|base|background|ink|dark|light)\b/i);
    const role = roleM ? roleM[1].toLowerCase() : "";
    const name = (clean(after.split(/[,;:.]/)[0]).slice(0, 3).join(" ")
      || clean(before.split(/[,;:.]/).pop() || "").slice(-3).join(" ")
      || role || "Colour");
    out.push({ name, hex, role, meaning: "" });
  }
  return out;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export async function runBackBrain(notes: string, brandName?: string, exBranding?: string, refs?: { notes?: string; images?: string[] }): Promise<{ spec: GuidelinesSpec; pptx: string; research: BrandResearch }> {
  // Understand the client's own logo/font/typography/palette references (vision-read any images,
  // fold in any pasted notes) so the deck is CO-CREATED from them.
  const referenceDigest = [refs?.notes?.trim(), await analyzeReferences(refs?.images ?? [])].filter(Boolean).join("\n\n") || undefined;
  const brief = await extractBrief(notes, brandName, exBranding, referenceDigest);
  let research: BrandResearch = {};
  try { research = await researchBrand(briefToBrain(brief)); } catch { /* best-effort */ }
  const spec = await buildGuidelines(brief, research, exBranding, referenceDigest);
  // If the client supplied a palette (via references), LOCK the deck to exactly those colours —
  // theme() then derives every deck colour from this palette only.
  const providedPalette = parseProvidedPalette(referenceDigest);
  if (providedPalette.length >= 2) spec.color.palette = providedPalette;
  const { buildPptx } = await import("./pptx"); // keep pptxgenjs out of the module graph until needed
  const pptx = await buildPptx(spec);            // base64 .pptx
  return { spec, pptx, research };
}

// ── 3. Render — reproduces the reference deck's design system exactly ─────────
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (h = "") => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`);
const lum = (hex: string) => {
  const c = norm(hex).replace("#", "");
  const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Pull the dark "ground", light "base" and "accent/gold" chrome from the brand's own palette. */
export function theme(spec: GuidelinesSpec) {
  const sw = (spec.color.palette ?? []).filter((p) => /^#?[0-9a-fA-F]{3,8}$/.test(p.hex.trim()));
  const byRole = (kw: RegExp) => sw.find((p) => kw.test(p.role) || kw.test(p.name));
  const hexes = sw.map((p) => norm(p.hex));
  const sorted = [...hexes].sort((a, b) => lum(a) - lum(b));
  const hasPalette = sw.length >= 2;
  const dark = norm((byRole(/ground|dark|earth|ink|charcoal|navy|black/i)?.hex) ?? sorted[0] ?? "#1C1008");
  const light = norm((byRole(/base|cream|ivory|paper|light|off.?white|white/i)?.hex) ?? sorted[sorted.length - 1] ?? "#F9F6F3");
  // Accent — prefer an accent role, else the most "mid" palette colour. With a palette we NEVER
  // leave it (pick a palette colour); only without a palette do we fall to a warm gold.
  let gold = byRole(/accent|gold|champ|brass|zari/i)?.hex ?? hexes.find((h) => lum(h) > 0.4 && lum(h) < 0.78);
  if (!gold && hasPalette) {
    const mids = hexes.filter((h) => h !== dark && h !== light);
    gold = mids.sort((a, b) => Math.abs(lum(a) - 0.5) - Math.abs(lum(b) - 0.5))[0] ?? sorted[Math.floor(sorted.length / 2)];
  }
  gold = norm(gold ?? "#C8A96E");
  // Body inks — when a palette is provided, STAY INSIDE IT (use the palette colours only);
  // otherwise fall back to legible neutral inks.
  const inkOnDark = hasPalette ? light : (lum(dark) < 0.5 ? "#F2EADD" : "#1C1008");
  const inkOnLight = hasPalette ? dark : (lum(light) > 0.5 ? "#241B12" : "#F2EADD");
  return { dark, light, gold, inkOnDark, inkOnLight };
}

export function renderDeck(spec: GuidelinesSpec): string {
  const t = theme(spec);
  const display = spec.typography.displayFont || "Bodoni Moda";
  const sans = spec.typography.sansFont || "Jost";
  const fams = Array.from(new Set([display, sans])).filter(Boolean);
  const fontLink =
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?${fams.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`).join("&")}&display=swap" rel="stylesheet">`;

  // helpers ------------------------------------------------------------------
  const paras = (v?: string | string[]) =>
    (Array.isArray(v) ? v : String(v ?? "").split(/\n\n+/))
      .map((p) => String(p).trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  const slot = (label: string, cls = "") => `<div class="slot ${cls}"><span>◳&nbsp; ${esc(label)}</span></div>`;
  const slides: string[] = [];
  const dark = (inner: string) => slides.push(`<section class="slide d">${inner}</section>`);
  const light = (inner: string) => slides.push(`<section class="slide l">${inner}</section>`);

  // a section title (gold Didone, uppercase) + body on the right
  const split = (title: string, bodyHtml: string) =>
    `<div class="pad"><div class="split"><h2 class="gtitle">${esc(title)}</h2><div class="body">${bodyHtml}</div></div></div>`;
  // stacked rows: gold title + body, no panel (mission/vision/positioning)
  const stack = (rows: { title: string; body: string }[]) =>
    `<div class="pad"><div class="rows">${rows.map((r) => `<h3 class="gtitle sm">${esc(r.title)}</h3><div class="body">${paras(r.body)}</div>`).join("")}</div></div>`;
  // panel rows: white card, gold word + caps sub + body
  const panel = (title: string, rows: { title: string; sub?: string; body: string }[]) =>
    `<div class="pad col"><h2 class="gtitle top">${esc(title)}</h2><div class="panel"><div class="prows">${rows.map((r) =>
      `<div class="pcell"><h3 class="gword">${esc(r.title)}</h3>${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ""}</div><div class="body">${paras(r.body)}</div>`).join("")}</div></div></div>`;
  const manifesto = (v: string[]) => `<div class="pad center"><div class="manif">${paras(v)}</div></div>`;
  const quote = (s: string) => `<div class="pad center"><blockquote>&ldquo;${esc(s)}&rdquo;</blockquote></div>`;

  // ── deck ──────────────────────────────────────────────────────────────────
  // Cover
  dark(`<div class="cover">${slot("hero image — full bleed", "bg")}<div class="cover-in">
    <div class="mono">${esc(spec.monogram)}</div>
    <div class="cname">${esc(spec.brandName)}</div>
    ${spec.tagline ? `<div class="ctag">${esc(spec.tagline)}</div>` : ""}
    <div class="cfoot">Brand Guidelines · Identity System</div>
  </div></div>`);

  // Mission / Vision / Positioning
  const mvp = [
    spec.mission && { title: "Brand Mission", body: spec.mission },
    spec.vision && { title: "Vision", body: spec.vision },
    spec.positioning && { title: "Positioning", body: spec.positioning },
  ].filter(Boolean) as { title: string; body: string }[];
  if (mvp.length) dark(stack(mvp));

  // Identity principles intro + the brand "world"
  if (spec.identityIntro.length) light(split("Identity Principles", paras(spec.identityIntro)));
  if (spec.manifesto.length) dark(manifesto(spec.manifesto));
  if (spec.world.length) light(panel(`The ${spec.brandName} World`, spec.world.slice(0, 4)));

  // Logo
  if (spec.logo.concept.length) dark(split("Logo", paras(spec.logo.concept)));
  light(`<div class="pad center"><div class="logolock">${slot("primary logo lockup")}</div></div>`);
  if (spec.logo.colorNote) light(`<div class="pad col"><h2 class="gtitle top">Logo Colour</h2><div class="body wide">${paras(spec.logo.colorNote)}</div><div class="duo">${slot("preferred — on dark")}${slot("preferred — on cream")}</div></div>`);
  if (spec.logo.variations.length) light(`<div class="pad col"><h2 class="gtitle top">Logo Variations</h2><div class="vargrid">${spec.logo.variations.slice(0, 6).map((v) => slot(v.name)).join("")}</div></div>`);
  if (spec.logo.safety.length) dark(split("Logo Safety", `<ul class="rules">${spec.logo.safety.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`));
  if (spec.logo.donts.length) light(split("Logo Don'ts", `<ul class="donts">${spec.logo.donts.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`));

  // Colour
  if (spec.color.philosophy.length) dark(split("Colour Philosophy", paras(spec.color.philosophy)));
  const pal = spec.color.palette ?? [];
  if (pal.length) {
    const isPrimary = (p: Swatch_) => /ground|base|primary|cream|dark|ink/i.test(p.role);
    const primary = pal.filter(isPrimary).slice(0, 2);
    const secondary = pal.filter((p) => !primary.includes(p));
    const chip = (p: Swatch_) => `<div class="swatch"><div class="chip" style="background:${esc(norm(p.hex))}"></div><div class="sw-meta"><strong>${esc(p.name)}</strong><span>${esc(norm(p.hex).toUpperCase())}</span></div></div>`;
    light(`<div class="pad col"><h2 class="gtitle top">Colour Palette</h2><div class="panel pal"><div class="palgroup"><div class="pcap">Primary colours</div><div class="chips">${(primary.length ? primary : pal.slice(0, 2)).map(chip).join("")}</div></div><div class="paldiv"></div><div class="palgroup"><div class="pcap">Secondary colours</div><div class="chips">${(primary.length ? secondary : pal.slice(2)).map(chip).join("")}</div></div></div></div>`);
    // detail slides, two swatches each
    for (let i = 0; i < pal.length; i += 2) {
      const pair = pal.slice(i, i + 2);
      light(`<div class="pad"><div class="swdetail">${pair.map((p) => `<div class="swrow"><div class="swbig"><div class="chip lg" style="background:${esc(norm(p.hex))}"></div><div class="sw-meta"><strong>${esc(p.name)}</strong><span>${esc(norm(p.hex).toUpperCase())}</span></div></div><div class="body">${paras(p.meaning)}</div></div>`).join("")}</div></div>`);
    }
  }
  if (spec.color.hierarchy.length) light(panel("Colour Hierarchy", spec.color.hierarchy.slice(0, 3)));

  // Typography
  if (spec.typography.philosophy.length) dark(split("Typography", paras(spec.typography.philosophy)));
  if (spec.typography.fonts.length) light(`<div class="pad col"><h2 class="gtitle top">Brand Fonts</h2><div class="fonts">${spec.typography.fonts.slice(0, 2).map((f, i) => `<div class="fontblk"><div class="fname">${esc(f.name)}</div><div class="fbig" style="font-family:${i === 0 ? "var(--display)" : "var(--sans)"}">${i === 0 ? "Aa" : "Aa"}</div><div class="fnums" style="font-family:${i === 0 ? "var(--display)" : "var(--sans)"}">1234567890</div><div class="frole">${esc(f.role)}</div></div>`).join("")}</div></div>`);
  if (spec.typography.scale.length) dark(split("Type Scale", `<ul class="rules">${spec.typography.scale.map((s) => `<li><strong>${esc(s.name)}.</strong> ${esc([s.spec, s.use].filter(Boolean).join(". "))}</li>`).join("")}</ul>`));
  if (spec.typography.scale.length) light(`<div class="pad"><div class="split"><div class="scalespec">${spec.typography.scale.slice(0, 4).map((s, i) => `<div class="specrow" style="font-size:${[44, 32, 22, 17][i] ?? 17}px">${esc(spec.brandName)}</div>`).join("")}</div><div class="body"><ul class="rules">${spec.typography.scale.map((s) => `<li><strong>${esc(s.name)}.</strong> ${esc([s.spec, s.use].filter(Boolean).join(". "))}</li>`).join("")}</ul></div></div></div>`);
  if (spec.typography.rules.length) dark(split("Type Rules", `<ul class="rules">${spec.typography.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`));
  if (spec.typography.inUse.length) light(panel("Type in Use", spec.typography.inUse.slice(0, 4)));

  // Statement, beliefs, intent, motifs
  if (spec.statement.length) dark(split("The Statement", paras(spec.statement)));
  if (spec.quotes[0]) light(quote(spec.quotes[0]));
  if (spec.beliefs.length) light(panel("What We Believe", spec.beliefs.slice(0, 3)));
  if (spec.intentIntro.length) dark(split("The Intent Behind the Design", paras(spec.intentIntro)));
  if (spec.patternStory?.title) light(split(spec.patternStory.title, paras(spec.patternStory.body)));
  if (spec.heroStory?.title) dark(split(spec.heroStory.title, paras(spec.heroStory.body)));
  if (spec.quotes[1]) light(quote(spec.quotes[1]));

  // Systems
  if (spec.waxSeal?.concept?.length) {
    dark(split("The Wax Seal", paras(spec.waxSeal.concept)));
    light(`<div class="pad center"><div class="seals">${slot("wax seal — on cream", "circle")}${slot("wax seal — on pattern", "circle")}</div></div>`);
  }
  if (spec.patternSystem.length) dark(split("Pattern System", `<ul class="rules">${spec.patternSystem.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`));
  if (spec.photography.philosophy.length) light(split("Photography", paras(spec.photography.philosophy)));
  if (spec.photography.inUse.length) dark(panel("Photography in Use", spec.photography.inUse.slice(0, 4)));

  // Application moodboards (image slots the operator fills)
  for (const a of spec.applications.slice(0, 4)) {
    const n = Math.max(2, Math.min(6, a.slots || 3));
    light(`<div class="pad col"><h2 class="board">${esc(a.label)}</h2><div class="boardgrid n${n}">${Array.from({ length: n }, (_, i) => slot(`image ${i + 1}`)).join("")}</div></div>`);
  }

  // Close
  if (spec.intent.length) dark(manifesto(spec.intent));

  // ── document ───────────────────────────────────────────────────────────────
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.brandName)} — Brand Guidelines</title>
${fontLink}
<style>
:root{
  --dark:${t.dark};--light:${t.light};--gold:${t.gold};
  --ink-d:${t.inkOnDark};--ink-l:${t.inkOnLight};
  --display:'${display}',Didot,'Times New Roman',serif;
  --sans:'${sans}','Futura',-apple-system,system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#2a2722;font-family:var(--sans);line-height:1.5;font-weight:300}
.deck{display:flex;flex-direction:column;align-items:center;gap:22px;padding:36px 16px}
.slide{position:relative;width:1280px;max-width:100%;aspect-ratio:16/9;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35)}
.slide.d{background:var(--dark);color:var(--ink-d)}
.slide.l{background:var(--light);color:var(--ink-l)}
.pad{position:absolute;inset:0;padding:8% 7%;display:flex;flex-direction:column;justify-content:center}
.pad.center{align-items:center;justify-content:center;text-align:center}
.pad.col{justify-content:center}

/* gold Didone section title */
.gtitle{font-family:var(--display);color:var(--gold);text-transform:uppercase;font-weight:500;letter-spacing:.05em;line-height:1.05;font-size:46px}
.gtitle.sm{font-size:38px}
.gtitle.top{margin-bottom:40px}

.split{display:grid;grid-template-columns:40% 60%;align-items:center;column-gap:4%}
.rows{display:grid;grid-template-columns:40% 60%;align-items:start;row-gap:64px;column-gap:4%}

.body{font-family:var(--sans);font-weight:300;font-size:18px;line-height:1.6;max-width:46ch}
.body.wide{max-width:80ch}
.body p+p{margin-top:18px}
.body strong{font-weight:500}

/* white panel rows */
.panel{background:#fff;color:var(--ink-l);padding:46px 52px}
.panel.pal{padding:54px 56px}
.prows{display:grid;grid-template-columns:38% 62%;align-items:start;row-gap:48px;column-gap:3%}
.pcell{display:flex;flex-direction:column;gap:8px}
.gword{font-family:var(--display);color:var(--gold);text-transform:uppercase;font-weight:500;letter-spacing:.04em;font-size:27px;line-height:1}
.sub{font-family:var(--sans);text-transform:uppercase;letter-spacing:.18em;font-size:12px;font-weight:400;color:#3a2f24;opacity:.85}
.panel .body{color:var(--ink-l)}

/* lists */
.rules,.donts{list-style:none;display:flex;flex-direction:column;gap:18px;max-width:48ch}
.rules li,.donts li{font-size:18px;font-weight:300;line-height:1.5;padding-left:24px;position:relative}
.rules li:before{content:"";position:absolute;left:0;top:.62em;width:10px;height:1px;background:var(--gold)}
.donts li:before{content:"✕";position:absolute;left:0;color:var(--gold);font-weight:500;font-size:14px;top:.05em}

/* manifesto + quote */
.manif{max-width:62ch}
.manif p{font-size:23px;line-height:1.5;font-weight:300}
.manif p+p{margin-top:26px}
blockquote{font-family:var(--sans);font-weight:300;font-size:30px;line-height:1.4;max-width:26ch}

/* cover */
.cover{position:absolute;inset:0}
.cover .slot.bg{position:absolute;inset:0;border:none;background:rgba(255,255,255,.02);min-height:0;align-items:flex-start;justify-content:flex-start;padding:28px}
.cover .slot.bg span{opacity:.32}
.cover-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mono{font-family:var(--display);font-size:120px;line-height:.9;color:var(--light);letter-spacing:.02em}
.cname{font-family:var(--display);text-transform:uppercase;letter-spacing:.14em;font-size:30px;margin-top:18px;color:var(--light)}
.ctag{font-family:var(--sans);font-weight:300;font-size:16px;margin-top:22px;opacity:.78;color:var(--light)}
.cfoot{position:absolute;bottom:8%;font-family:var(--sans);text-transform:uppercase;letter-spacing:.22em;font-size:11px;opacity:.5;color:var(--light)}

/* logo + image slots */
.slot{border:1px dashed rgba(127,110,84,.5);border-radius:6px;min-height:150px;display:flex;align-items:center;justify-content:center;color:rgba(127,110,84,.85);font-size:12px;letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:14px}
.d .slot{border-color:rgba(242,234,221,.28);color:rgba(242,234,221,.5)}
.slot.circle{border-radius:50%;aspect-ratio:1;min-height:0}
.logolock{width:62%;aspect-ratio:16/9}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px}
.duo .slot{aspect-ratio:16/8}
.vargrid{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;gap:26px}
.vargrid .slot{aspect-ratio:16/9}
.seals{display:flex;gap:80px;width:74%}
.seals .slot{flex:1}

/* swatches */
.pal{display:flex;align-items:stretch;gap:0}
.palgroup{flex:1;padding:0 26px}
.pcap{font-family:var(--sans);font-size:15px;color:#3a2f24;text-align:center;margin-bottom:30px}
.paldiv{width:1px;background:#d8cdbd;margin:8px 0}
.chips{display:flex;gap:26px;justify-content:center}
.chip{width:120px;height:120px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.chip.lg{width:150px;height:150px}
.sw-meta{margin-top:12px;text-align:center;font-family:var(--sans);color:var(--ink-l)}
.sw-meta strong{display:block;font-size:15px;font-weight:400}
.sw-meta span{font-size:13px;opacity:.6}
.swdetail{display:flex;flex-direction:column;gap:56px;justify-content:center;height:100%}
.swrow{display:grid;grid-template-columns:32% 68%;align-items:center;column-gap:3%}
.swbig{display:flex;flex-direction:column}.swbig .sw-meta{text-align:left}

/* type specimens */
.fonts{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:end}
.fontblk{text-align:left}
.fname{font-family:var(--display);font-size:30px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:24px}
.fbig{font-size:150px;line-height:.9}
.fnums{font-size:34px;letter-spacing:.08em;margin-top:24px}
.frole{font-family:var(--sans);text-transform:uppercase;letter-spacing:.16em;font-size:12px;opacity:.6;margin-top:18px}
.scalespec{display:flex;flex-direction:column;gap:18px;justify-content:center}
.specrow{font-family:var(--display);letter-spacing:.02em;line-height:1}

/* application boards */
.board{font-family:var(--sans);font-weight:600;font-size:30px;color:var(--ink-l);margin-bottom:34px}
.boardgrid{display:grid;gap:26px}
.boardgrid.n2{grid-template-columns:repeat(2,1fr)}
.boardgrid.n3,.boardgrid.n6{grid-template-columns:repeat(3,1fr)}
.boardgrid.n4{grid-template-columns:repeat(2,1fr)}
.boardgrid.n5{grid-template-columns:repeat(3,1fr)}
.boardgrid .slot{aspect-ratio:4/3}

.fitw{width:100%}
.pad.center>.fitw{display:flex;flex-direction:column;align-items:center;text-align:center}
@media print{
  body{background:#fff}
  .deck{padding:0;gap:0}
  .slide{box-shadow:none;width:100%;height:100vh;page-break-after:always;break-after:page}
  @page{size:1280px 720px;margin:0}
}
</style></head>
<body><div class="deck">${slides.join("\n")}</div>
<script>
/* Auto-fit: guarantee every slide's content sits fully inside the frame —
   never off the bottom, never off the edge. Scales the content down only if it would overflow. */
(function(){
  function fit(){
    var slides=document.querySelectorAll('.slide');
    for(var i=0;i<slides.length;i++){
      var pad=slides[i].querySelector('.pad'); if(!pad) continue;
      var wrap=pad.querySelector(':scope > .fitw');
      if(!wrap){ wrap=document.createElement('div'); wrap.className='fitw';
        while(pad.firstChild){ wrap.appendChild(pad.firstChild); } pad.appendChild(wrap); }
      wrap.style.transform='none';
      var cs=getComputedStyle(pad);
      var availH=pad.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
      var availW=pad.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      var h=wrap.scrollHeight, w=wrap.scrollWidth;
      var k=Math.min(h>availH?availH/h:1, w>availW?availW/w:1);
      if(k<0.999){ k=Math.max(0.4,k); wrap.style.transformOrigin='center center'; wrap.style.transform='scale('+k+')'; }
    }
  }
  function run(){ fit(); setTimeout(fit,80); setTimeout(fit,300); }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run);}
  window.addEventListener('load',run);
  window.addEventListener('resize',fit);
  window.addEventListener('beforeprint',fit);
})();
</script>
</body></html>`;
}

type Swatch_ = z.infer<typeof Swatch>;
