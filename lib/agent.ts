import OpenAI from "openai";
import type { BrandProfile } from "./types";
import { chatCreate } from "./openaiClient";

/**
 * The conversation brain — a creative-director agent with tool-use. It converses,
 * and drives the UI by calling actions (ask for products, show the panel, generate).
 * Azure GPT-5.5 now; swaps to claude-sonnet-4-6 when ANTHROPIC_API_KEY is set.
 */

export type ShootBrief = {
  express?: string;
  background?: string;
  surface?: string;
  vibe?: string;
  lighting?: string;
  composition?: string;
  format?: string;
  numAngles?: number;
  shotsPerAngle?: number;
};

export type AgentAction =
  | { type: "request_product_upload"; message?: string }
  | { type: "show_panel" }
  | { type: "start_brand_conversation" }
  | { type: "open_brand_studio" }
  | { type: "research_brand"; name: string }
  | { type: "select_brand"; name: string }
  | { type: "generate_shoot"; brief: ShootBrief };

export type ConvState = {
  stage?: string;
  goal?: string;
  channel?: string;
  quantity?: string;
  brandStatus?: "have" | "needs" | "in_progress";
  productCount?: number;
  creativeType?: string; // the workspace's active type: product | instagram | story | carousel | ad
};

export type ChatMsg = { role: "user" | "assistant"; content: string };

const PERSONA = `You are the Creative Co-pilot — a sharp, warm, decisive creative director who turns a brand's products into photography a creative director would sign off on.

HOW YOU WORK:
- Talk like a person, not a form. Propose, don't interrogate. Ask at most ONE question per turn, and only the questions that actually change the work.
- Lead with a confident recommendation the user can accept by just saying "go".

WHEN THE BRAND IS ALREADY KNOWN (a Brand Profile is present below):
- The brand has ALREADY been researched. You know their positioning, audience, palette, and — most importantly — their real PHOTOGRAPHY SIGNATURE (the backgrounds, surfaces, colour grade, lighting, styling and crops they actually use). Treat all of it as established fact you walked in already knowing.
- DO NOT interview them about their own brand. Never ask what their vibe is, what colours they use, who their audience is, what aesthetic or "look" they want, or "tell me about your brand." You already have it — asking insults the work you've done.
- Open the conversation by demonstrating you know them: propose a specific, on-brand shoot grounded in their ACTUAL signature — name the real surface, colour, and light you'd shoot on, tied to how they really look — and invite a "go". E.g. "For <brand> I'd put the <product> on <their real surface> in <their light>, <their colour world> — say go and I'll run the set."
- The ONLY things you may ask, and only when genuinely missing, are operational: which product to shoot (if none is uploaded yet) and what the set is for (campaign hero, PDP, social) — and even those, prefer to assume a smart default and let them correct you rather than ask. One light operational question max; never a brand-discovery question.
- READINESS RULE: you need exactly three things before you can generate — a goal, a brand floor (a Brand Profile, even a lightweight one), and at least one product image. The moment you have all three, OFFER TO GENERATE. Do not keep asking questions once you can produce.
- You can always generate from brand defaults — a near-empty brief still makes an on-brand shoot. Never hard-block on the panel.
- NEVER expose prompts, model names, angle codes, JSON, or internal mechanics. Stay in the brand's register.
- COUNT VOCABULARY (use the plain, intuitive meaning — never invert it): "angles" = the number of DISTINCT camera angles/looks (→ numAngles). "shots", "images", "photos", "pictures" = the total number of images; when said with no other qualifier, treat them as that many distinct angles (→ numAngles), shotsPerAngle 1. "variations" / "versions of the same angle" = how many pictures PER angle (→ shotsPerAngle). EXAMPLES: "6 angles" → numAngles 6, shotsPerAngle 1 (six DIFFERENT angles, never six of the same). "6 shots" → numAngles 6. "3 angles, 2 variations each" → numAngles 3, shotsPerAngle 2 (total 6). Default shotsPerAngle to 1 unless the client explicitly asks for variations of the same angle. total images = numAngles × shotsPerAngle.

CREATIVE TYPES: the workspace may be set to an Instagram creative, a Story, a Carousel, or an Ad campaign (see creativeType in CONVERSATION STATE). The flow is IDENTICAL — you still call generate_shoot with their words in "express"; the workspace handles the format, frame count and placements automatically, so never ask about aspect ratios, sizes or "which placements". Speak the type's language and direct the CONCEPT:
- instagram → one scroll-stopping organic feed frame; propose the moment, not a packshot.
- story → a full-bleed vertical moment (the tall frame is handled for you).
- carousel → ONE idea told across swipes: propose a hook → story → close arc and carry the narrative in "express" (e.g. "open on the pour, then the texture, close on the full bottle"). Frame count is set in the panel — don't ask about it unless they bring it up.
- ad → one conversion-minded hero concept; it is fanned across every placement automatically, and the headline + CTA copy are written for them as editable overlay text — never baked into the image, so never promise text inside the photo.
For these types numAngles means: how many alternate OPTIONS (instagram/story) or distinct CONCEPTS (ad). Default 1.

YOUR TOOLS (call them to drive the screen):
- request_product_upload — when you need product photos and none are uploaded.
- show_panel — reveal the optional fine-tune controls. DO NOT push this upfront. Only call it LATER, once shots are on the canvas AND the user is unsatisfied or wants to adjust specific parameters (background, surface, vibe, lighting, composition, format, angles/shots). Fine-tuning is a recovery step, not the starting point.
- start_brand_conversation — quick in-chat brand intake when they have no brand yet.
- open_brand_studio — route to the fuller brand builder.
- generate_shoot — generate now; pass their request VERBATIM in "express", leave the rest blank to fill from the brand and the panel. WHENEVER the user describes what they want (a scene, place, setting, background, mood, colour, prop, styling, or any concrete visual direction) AND a product is present, call this RIGHT AWAY with their exact words in "express" — do not merely acknowledge their idea in words, PRODUCE it. What they type must show up in the shots.

FLOW (produce-first; fine-tune is for later): intent → (brand if missing) → ask for the product upload → the moment you have a goal, a brand floor and at least one product, GENERATE on-brand right away by calling generate_shoot. Do NOT push the panel or interrogate first — the brand and the industry playbook already give you everything to make a strong on-brand set. After the shots land on the canvas, if the user is unsatisfied or wants to change something specific (e.g. "too dark", "try it on marble", "more shots", "different background"), THEN either regenerate with that direction via generate_shoot, or call show_panel so they can dial it in — fine-tuning only enters once they've seen real output and want to push it. When they say "go", "produce", "make it", "done", or anything that means proceed, call generate_shoot. Keep replies short and warm — two or three sentences. When you call a tool, still say a natural line to the user.`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "request_product_upload", description: "Ask for and open the product uploader. Use when you need product images and none are uploaded.", parameters: { type: "object", properties: { message: { type: "string", description: "A short warm line asking for the product photo(s)." } } } } },
  { type: "function", function: { name: "show_panel", description: "Reveal the optional fine-tune panel (background, surface, vibe, lighting, composition, format, angles, shots). Use ONLY after shots are on the canvas and the user is unsatisfied or wants to adjust specifics — never upfront before the first generation.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "start_brand_conversation", description: "Begin the lightweight in-chat brand intake (palette, mood, 3-5 adjectives). Use when there is no brand profile and the user prefers a quick chat.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "open_brand_studio", description: "Route the user to the fuller Brand Studio page.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "select_brand", description: "Switch the workspace to one of the user's ALREADY-SAVED brands, locking every next creative (palette, voice, guidelines) to it. Use when the user says to work on / switch to / open a specific brand by name (e.g. 'let's do Olipop', 'switch to Poppi'). Only pick from the SAVED BRANDS list in context; never invent a name. To build a brand-new brand instead, use open_brand_studio.", parameters: { type: "object", properties: { name: { type: "string", description: "The exact brand name to switch to, copied from the SAVED BRANDS list." } }, required: ["name"] } } },
  { type: "function", function: { name: "generate_shoot", description: "Generate the product photoshoot now. Call once you have a goal, a brand floor, and at least one product image.", parameters: { type: "object", properties: { express: { type: "string", description: "The client's request in THEIR OWN WORDS, verbatim — the primary direction for the shoot (e.g. 'on a sunny beach with a surfboard at golden hour'). ALWAYS fill this with what they actually asked for; it drives the whole shot." }, background: { type: "string" }, surface: { type: "string" }, vibe: { type: "string" }, lighting: { type: "string" }, composition: { type: "string" }, styling: { type: "string", description: "How dressed the scene is: Minimal / clean, A few props, Maximal — prop-rich, Ingredient scatter, or Bold colour-block.", enum: ["Minimal / clean", "A few props", "Maximal — prop-rich", "Ingredient scatter", "Bold colour-block"] }, format: { type: "string", enum: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"] }, numAngles: { type: "number", description: "Number of DISTINCT camera angles/looks to shoot. The client calls this 'angles' (and usually 'shots'/'images' too): '6 angles' or '6 shots' → 6." }, shotsPerAngle: { type: "number", description: "How many pictures (variations) of EACH angle. Only > 1 when the client explicitly wants multiple versions of the SAME angle. Default 1." } } } } },
];

/** Lay the researched brand out as a readable dossier the agent walks in already knowing — not a raw JSON blob it skims past. */
function brandBriefForAgent(p: BrandProfile): string {
  const rb = (p.rulebook ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []);
  const palette = (p.palette ?? []).map((c) => [c.hex, c.name && `(${c.name})`].filter(Boolean).join(" ")).join(", ");
  const researched = rb.researched === true || Boolean(s(rb.summary) || s(rb.aesthetic));

  const L: string[] = [];
  L.push(researched
    ? `You have ALREADY researched this brand. Everything below is known fact — do not re-ask any of it.`
    : `You know the basics of this brand below. Fill any blank from it; don't interrogate.`);
  L.push(`\nBrand: ${p.name}`);
  if (s(rb.essence) || p.positioning) L.push(`Who they are: ${s(rb.essence) || p.positioning}`);
  if (p.audience) L.push(`Audience: ${p.audience}`);
  const cat = [s(rb.category), s(rb.productType)].filter(Boolean).join(" — ");
  if (cat) L.push(`Category / products: ${cat}`);
  if (s(rb.vibe)) L.push(`Vibe: ${s(rb.vibe)}`);
  if (s(rb.voice)) L.push(`Voice: ${s(rb.voice)}`);
  if (s(rb.ideology)) L.push(`Values / POV: ${s(rb.ideology)}`);
  if (palette) L.push(`Palette: ${palette}`);
  if (s(rb.aesthetic)) L.push(`THEIR PHOTOGRAPHY SIGNATURE (shoot to match this): ${s(rb.aesthetic)}`);
  const comp = list(rb.competitors);
  if (comp.length) L.push(`Reference / competitor brands: ${comp.join(", ")}`);
  const amb = list(rb.ambassadors);
  if (amb.length) L.push(`Faces / ambassadors: ${amb.join(", ")}`);
  const campaigns = list(rb.campaigns);
  if (campaigns.length) L.push(`Their past marketing campaigns (you know these — build on what worked, echo the ones that landed, never blindly repeat): ${campaigns.slice(0, 8).join(" | ")}`);
  const proof = list(rb.socialProof);
  if (proof.length) L.push(`Social proof / traction (lean on it where relevant): ${proof.slice(0, 8).join("; ")}`);
  if (s(rb.summary)) L.push(`Visual identity: ${s(rb.summary)}`);
  const products = list(rb.products);
  if (products.length) L.push(`Their product line-up (real catalogue): ${products.slice(0, 40).join(", ")}`);
  const found = [s(rb.website), s(rb.instagram)].filter(Boolean).join("  ·  ");
  if (found) L.push(`Found at: ${found}`);
  if (p.doNot?.length) L.push(`Do-not list (hard rules): ${p.doNot.join("; ")}`);
  return L.join("\n");
}

export function activeAgentBrain(): string {
  return process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-6" : process.env.AZURE_OPENAI_DEPLOYMENT ?? "azure-openai";
}

function defaultReply(actions: AgentAction[]): string {
  const a = actions[0];
  if (!a) return "Tell me a little more and we'll get going.";
  if (a.type === "request_product_upload") return a.message || "Could you share your product photo? One or several — I'll take it from there.";
  if (a.type === "generate_shoot") return "On it — generating your set now. It'll appear on the canvas.";
  if (a.type === "show_panel") return "I've opened the fine-tune panel on the left — tweak anything, or just say go.";
  if (a.type === "start_brand_conversation") return "Let's set your brand quickly — what three or four words describe its feel?";
  if (a.type === "open_brand_studio") return "Opening Brand Studio so you can build the full profile.";
  if (a.type === "select_brand") return `Switching to ${a.name} — palette, voice and guidelines are loading, and everything I make next stays on-brand.`;
  return "Got it.";
}

export async function runAgent(args: {
  skill: string;
  profile: BrandProfile | null;
  state: ConvState;
  messages: ChatMsg[];
  memory?: string; // recalled per-brand agent memory (preferences/facts/summary from past sessions)
  availableBrands?: string[]; // the user's saved brand names — the pool select_brand may switch to
}): Promise<{ reply: string; actions: AgentAction[] }> {
  const saved = (args.availableBrands ?? []).filter((n) => n && n.trim());
  const system = [
    PERSONA,
    `ACTIVE SKILL (governs your craft):\n${args.skill}`,
    args.profile ? `ACTIVE BRAND — what you already know (the floor for every blank; never re-interview it):\n${brandBriefForAgent(args.profile)}` : "BRAND: none yet — the user has no brand profile.",
    saved.length
      ? `SAVED BRANDS (the user can switch between these — call select_brand with the EXACT name to lock the workspace to one; everything you then make stays inside that brand): ${saved.join(", ")}.`
      : "SAVED BRANDS: none besides the active one.",
    ...(args.memory?.trim() ? [args.memory.trim()] : []),
    `CONVERSATION STATE:\n${JSON.stringify(args.state)}`,
  ].join("\n\n---\n\n");

  // OpenAI / Azure path with provider failover (Claude tool-use is wired the same way when
  // ANTHROPIC_API_KEY lands). chatCreate handles quota failover + transient retry.
  const r = await chatCreate({
    max_completion_tokens: 4000,
    tools,
    messages: [{ role: "system" as const, content: system }, ...args.messages.map((m) => ({ role: m.role, content: m.content }))],
  });

  const msg = r.choices[0]?.message;
  const actions: AgentAction[] = [];
  for (const tc of msg?.tool_calls ?? []) {
    let a: Record<string, unknown> = {};
    try { a = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
    const name = tc.function.name;
    if (name === "generate_shoot") actions.push({ type: "generate_shoot", brief: a as ShootBrief });
    else if (name === "request_product_upload") actions.push({ type: "request_product_upload", message: a.message as string | undefined });
    else if (name === "select_brand" && typeof a.name === "string" && a.name.trim()) actions.push({ type: "select_brand", name: a.name.trim() });
    else if (name === "show_panel" || name === "start_brand_conversation" || name === "open_brand_studio") actions.push({ type: name });
  }

  const reply = (msg?.content ?? "").trim() || defaultReply(actions);
  return { reply, actions };
}
