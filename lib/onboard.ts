import { z } from "zod";
import type { BrandBrain, BrandProfile } from "./types";
import { chatCreate } from "./openaiClient";

/** Turn the learned brand brain into the profile context the art director / agent reads. */
export function brainToProfile(b: BrandBrain): BrandProfile {
  const intel = b.intelligence;
  // Prefer the richer Intelligence palette, else the research palette.
  const palette = (intel?.palette?.length ? intel.palette : b.research?.palette ?? []).map((p) => ({ name: p.role || "", hex: p.hex }));
  return {
    id: "brain",
    name: b.name || "Brand",
    positioning: intel?.positioning || b.research?.essence || b.purpose,
    audience: intel?.audience || b.audience,
    palette,
    rulebook: {
      vibe: b.vibe, category: b.category, productType: b.productType,
      essence: intel?.positioning || b.research?.essence, voice: intel?.toneOfVoice || b.research?.voice,
      copyPlaybook: intel?.copyPlaybook, // consumed only by campaignCopy — never fed to image prompts

      ideology: b.ideology, purpose: intel?.purpose || b.purpose,
      // The concrete, reproducible photography signature is the single most important cue.
      aesthetic: intel?.photographyStyle || b.research?.aesthetic,
      // The photographic RULEBOOK read off the brand's own photos (light/lens/grade/surfaces
      // + the hard never-do list). The planner treats this as law above the prose aesthetic.
      photoRules: b.research?.photoRules,
      photographyStyle: intel?.photographyStyle, packagingStyle: intel?.packagingStyle,
      visualIdentity: intel?.visualIdentity, personality: intel?.personality,
      values: intel?.values, persona: intel?.persona, mission: intel?.mission, vision: intel?.vision,
      instagram: intel?.instagram || b.research?.instagram,
      website: intel?.website || b.research?.website, summary: intel?.overview || b.research?.summary,
      competitors: (intel?.competitors ?? []).map((c) => c.name).filter(Boolean).length
        ? (intel?.competitors ?? []).map((c) => c.name).filter(Boolean)
        : b.research?.competitors,
      ambassadors: b.research?.ambassadors,
      products: (b.catalog ?? []).map((p) => p.name).filter(Boolean).slice(0, 40).length
        ? (b.catalog ?? []).map((p) => p.name).filter(Boolean).slice(0, 40)
        : (b.research?.products ?? []).map((p) => p.name).filter(Boolean),
      researched: Boolean(intel || b.research?.summary || b.research?.aesthetic),
    },
    // Honour any explicit "avoid / never" notes the research surfaced as brand constraints.
    doNot: (intel?.insights ?? []).filter((s) => /\b(avoid|never|don['’]?t|no\b)/i.test(s)).slice(0, 6),
  };
}

/**
 * The onboarding brain. Runs a warm, guided brand intake — one question per turn,
 * each with clickable option chips — and extracts answers into the Brand Brain.
 */

const OnboardSchema = z.object({
  reply: z.string(),
  options: z.array(z.string()).max(6).default([]),
  field: z.string().default(""),
  brainPatch: z.record(z.string()).default({}),
  complete: z.boolean().default(false),
});

export type OnboardResult = z.infer<typeof OnboardSchema>;
export type ChatMsg = { role: "user" | "assistant"; content: string };

const FIELDS = "name (brand name), category (industry / what kind of brand), audience (specific target audience), vibe (aesthetic / feeling), productType (what products they sell), purpose (mission), ideology (the values / point of view they stand for), palette (any brand colours or guidelines they have)";

function stripFences(t: string): string {
  const f = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (f?.[1]) return f[1].trim();
  const i = t.indexOf("{");
  return i >= 0 ? t.slice(i, t.lastIndexOf("}") + 1) : t;
}

const RecognizeSchema = z.object({
  known: z.boolean().default(false),
  brain: z
    .object({
      name: z.string().default(""),
      category: z.string().default(""),
      audience: z.string().default(""),
      vibe: z.string().default(""),
      productType: z.string().default(""),
      purpose: z.string().default(""),
      ideology: z.string().default(""),
    })
    .partial()
    .default({}),
});

/**
 * Deterministic brand recognition. A focused, single-purpose call (far more reliable
 * than asking the conversational onboarder to "complete on turn one"): if the user
 * named an established real brand, return a fully-filled brain so we skip the Q&A and
 * go straight to live research. Returns null for new / unknown brands.
 */
async function recognizeKnownBrand(text: string): Promise<OnboardResult | null> {
  if (!text.trim()) return null;
  const system =
    `You identify brands. Decide if the user named a SPECIFIC, established, real-world brand you recognise with confidence — one with genuine market presence (e.g. Olipop, Liquid Death, Glossier, Nike, Oatly). ` +
    `If YES: return {"known":true,"brain":{...}} with EVERY field filled from your own knowledge of that brand — name, category, audience, vibe, productType, purpose, ideology — each specific and confident, none blank. ` +
    `If it is NOT a clearly recognisable established brand (new, small, unknown, generic, or no brand named): return {"known":false}. ` +
    `Return STRICT JSON ONLY.`;
  try {
    const r = await chatCreate({
      max_completion_tokens: 1500,
      messages: [{ role: "system", content: system }, { role: "user", content: text }],
    });
    const parsed = RecognizeSchema.parse(JSON.parse(stripFences(r.choices[0]?.message?.content ?? "{}")));
    if (!parsed.known || !parsed.brain?.name) return null;
    const b = parsed.brain;
    const brainPatch: Record<string, string> = {};
    for (const k of ["name", "category", "audience", "vibe", "productType", "purpose", "ideology"] as const) {
      if (b[k]?.trim()) brainPatch[k] = b[k]!.trim();
    }
    return {
      reply: `Love it — I know ${b.name}. No need to quiz you; I'm pulling their real palette, packaging and photography from live research now.`,
      options: [],
      field: "",
      brainPatch,
      complete: true,
    };
  } catch {
    return null;
  }
}

/** Pull a likely brand name + what-they-make out of the latest user turn, so we can research with minimal asking. */
const ExtractSchema = z.object({
  name: z.string().default(""),
  category: z.string().default(""),
  productType: z.string().default(""),
  vibe: z.string().default(""),
  palette: z.string().default(""),
});

async function quickExtract(messages: ChatMsg[], brain: BrandBrain): Promise<Partial<BrandBrain>> {
  const convo = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  try {
    const r = await chatCreate({
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: `Extract brand facts from the conversation into STRICT JSON: {"name","category","productType","vibe","palette"}. name = the brand's name. category = the industry (e.g. "indie fragrance", "snack brand", "skincare"). productType = what they actually sell. vibe = any aesthetic/feeling words they used. palette = any colours they named (comma list). Leave a field "" if not stated. Do NOT invent. JSON only.` },
        { role: "user", content: convo },
      ],
    });
    const e = ExtractSchema.parse(JSON.parse(stripFences(r.choices[0]?.message?.content ?? "{}")));
    const patch: Partial<BrandBrain> = {};
    for (const k of ["name", "category", "productType", "vibe", "palette"] as const) {
      const v = e[k]?.trim();
      if (v && !brain[k]) (patch as Record<string, string>)[k] = v;
    }
    return patch;
  } catch {
    return {};
  }
}

export async function runOnboard(messages: ChatMsg[], brain: BrandBrain): Promise<OnboardResult> {
  // Before any interrogation: if we don't yet have a brand and the user just named an
  // established one, recognise it and skip straight to research.
  if (!brain.name) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const known = await recognizeKnownBrand(lastUser);
    if (known) return known;
  }

  // RESEARCH-FIRST GATE. Live research does the heavy lifting — given just the brand NAME it
  // finds the category, products, palette, aesthetic and competitors via web grounding. So the
  // MOMENT we have a brand name, STOP asking and go research. Never interrogate category,
  // ideology, purpose, audience or values out of a founder. Merge anything stated this turn first.
  const extracted = { ...brain, ...(await quickExtract(messages, brain)) };
  const enoughToResearch = Boolean(extracted.name);
  if (enoughToResearch) {
    const patch: Record<string, string> = {};
    for (const k of ["name", "category", "productType", "vibe", "palette"] as const) {
      const v = extracted[k];
      if (typeof v === "string" && v.trim() && !brain[k]) patch[k] = v.trim();
    }
    return {
      reply: `Got it — ${extracted.name}. No need to quiz you; I'll study your world directly — your real palette, packaging, photography and the brands you sit next to — and build the rest from that. One sec.`,
      options: [],
      field: "",
      brainPatch: patch,
      complete: true,
    };
  }

  const system =
    `You are the Creative Co-pilot, warmly onboarding a brand. Talk like a sharp creative director, not a form. Your goal is to get them into research FAST, not to interview them.\n` +
    `RESEARCH DOES THE WORK. You have a live web-research step that, given just the brand NAME, studies the brand directly — finds their real category, products, palette, packaging, photography signature and competitors, and infers their audience, vibe and positioning. So the ONLY thing you ever need from the user is the BRAND NAME. Everything else, research finds.\n` +
    `THE MOMENT YOU HAVE A BRAND NAME → set complete=true and hand off to research. Do not ask what they make, what their category is, who their audience is, or anything else — research determines all of it. Researching beats asking.\n` +
    `NEVER INTERROGATE. Do NOT ask a founder to pick their ideology, purpose, values, mission, category, audience, vibe, or "point of view" — that is all yours to research and infer, never to quiz them on.\n` +
    `KNOWN BRANDS. If the user names an ESTABLISHED brand you recognise (e.g. Olipop, Glossier, Nike), set complete=true on the FIRST reply, fill brainPatch with name (plus category/productType/vibe if you know them), return empty options, and say you're pulling their real identity from research now.\n` +
    `IF YOU DON'T YET HAVE A BRAND NAME: ask exactly ONE warm question to learn the brand's name, with 4-6 short example chips. Nothing else. As soon as they give a name, research.\n` +
    `Extract every fact stated into brainPatch using ONLY these keys: name, category, productType, vibe, palette. Keep values short. (Only what they actually said — research fills the rest.)\n` +
    `Set complete=true as soon as you know the brand NAME. When complete, reply warmly that you'll study their world directly now, and return empty options.\n` +
    `Current brain so far: ${JSON.stringify(brain)}.\n` +
    `Return STRICT JSON ONLY: {"reply":"...","options":["..."],"field":"<field you are asking>","brainPatch":{"key":"value"},"complete":false}`;

  const raw = (await chatCreate({
    max_completion_tokens: 2000,
    messages: [{ role: "system" as const, content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
  })).choices[0]?.message?.content ?? "";
  try {
    return OnboardSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    return { reply: raw.slice(0, 300) || "Tell me a bit about your brand.", options: [], field: "", brainPatch: {}, complete: false };
  }
}
