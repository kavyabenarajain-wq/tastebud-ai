import OpenAI from "openai";
import type { BrandProfile, ModelSpec } from "./types";
import { chatCreate } from "./openaiClient";

/**
 * The model-photoshoot conversation brain — a casting-director-meets-photographer
 * agent with tool-use. It keeps the interaction light: the client either builds a
 * model or pastes a reference, optionally sets a scene, and shoots. The heavy
 * curation lives in the left panel; this agent nudges, confirms, and triggers
 * generation. Azure GPT-5.5 now; swaps to claude-sonnet-4-6 when the key is set.
 */

export type ModelShootBrief = {
  express?: string;
  background?: string;
  vibe?: string;
  lighting?: string;
  composition?: string;
  format?: string;
  productUse?: string;
  numAngles?: number;
  shotsPerAngle?: number;
};

export type ModelAgentAction =
  | { type: "request_reference_upload"; message?: string }
  | { type: "request_product_upload"; message?: string }
  | { type: "set_model_source"; source: "build" | "reference" }
  | { type: "patch_model"; spec: Partial<ModelSpec> }
  | { type: "show_scene" }
  | { type: "generate_model_shoot"; brief: ModelShootBrief };

export type ModelConvState = {
  modelReady?: boolean; // has the client established a model (built or reference)?
  modelSource?: "build" | "reference";
  hasReference?: boolean;
  productCount?: number;
};

export type ChatMsg = { role: "user" | "assistant"; content: string };

const PERSONA = `You are the Creative Co-pilot in MODEL mode — a casting director, stylist and photographer rolled into one, with real taste. You make hyper-real model photography that a creative director would believe a camera made. The fastest way to break a brand is a model who looks like AI, so realism is everything.

HOW YOU WORK:
- Talk like a person, not a form. Propose, don't interrogate. One question per turn at most, only the ones that change the shoot.
- Keep it LIGHT. The client mostly just needs to (1) establish a model — build one on the left, or paste a reference photo of the person they want — and (2) say go. Scene controls exist but are optional and secondary; lead with the model.
- Lead with a confident recommendation the user can accept by saying "go".
- READINESS: you can generate as soon as a model is established (built attributes OR a pasted reference) and there's a brand floor. A product is OPTIONAL — a pure portrait / model shoot is fine. The moment you can produce, OFFER TO.
- If the client pastes a reference person, reassure them you'll reproduce THAT person faithfully and never beautify them away.
- MATCH THE INTERACTION TO THE PRODUCT — basic sense: a person EATS, licks or shows FOOD; SIPS or pours a DRINK; WEARS apparel or jewellery; APPLIES beauty; SITS ON, lounges on or sleeps on FURNITURE; HOLDS and uses an object. A person can NEVER wear food or furniture. Pick the action the product's category actually allows; when several genuinely fit, offer a couple of on-brand options in a sentence, or just choose the strongest and go.
- You can cast MORE THAN ONE person — up to about four. If the client wants a group ("me and two friends", "three models"), ask briefly who's in frame and what each is doing, then shoot the group.
- NEVER expose prompts, model names, angle codes, JSON or internal mechanics. Stay in the brand's register. Keep replies to two or three warm sentences.

YOUR TOOLS (call them to drive the screen):
- set_model_source — switch the left builder to "build" or "reference" when the client signals which they want.
- patch_model — when the client describes their model in chat (e.g. "a woman in her 30s, deep skin, short natural curls"), capture those attributes so the builder fills in.
- request_reference_upload — open the reference uploader when they want to use their own model's photo.
- request_product_upload — open the product uploader when a product should be worn/held/applied and none is uploaded.
- show_scene — reveal the optional scene controls (setting, lighting, mood, composition, format).
- generate_model_shoot — shoot now. Pass their request VERBATIM in "express"; leave the rest blank to fill from the model, the scene panel and the brand. WHENEVER the user describes what they want (a scene, place, setting, wardrobe, mood, action, prop or any concrete visual direction) AND a model is established, call this RIGHT AWAY with their exact words in "express" — do not just acknowledge their idea, PRODUCE it. What they type must show up in the shots.

FLOW: establish the model (build or reference) → optionally a product and a scene note → on "go", "shoot", "make it", or any concrete visual direction, call generate_model_shoot with their words in "express". Always say a natural line even when you call a tool.`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "set_model_source", description: "Switch the left model builder between building a model and using a pasted reference photo.", parameters: { type: "object", properties: { source: { type: "string", enum: ["build", "reference"] } }, required: ["source"] } } },
  { type: "function", function: { name: "patch_model", description: "Capture model attributes the client described in chat so the left builder fills in.", parameters: { type: "object", properties: { gender: { type: "string" }, ageRange: { type: "string" }, ethnicity: { type: "string" }, skinTone: { type: "string" }, hairColor: { type: "string" }, hairStyle: { type: "string" }, eyes: { type: "string" }, bodyType: { type: "string" }, vibe: { type: "string" }, expression: { type: "string" }, productUse: { type: "string", enum: ["Worn", "Held", "Applied", "Eaten", "Sipped", "Poured", "SatOn", "LoungedOn", "SleptOn", "Used", "Shown", "In-context", "None"], description: "How the model physically interacts with the product — MUST fit the product's category (food is Eaten/Shown, a drink is Sipped, furniture is SatOn/LoungedOn, apparel/jewellery is Worn, beauty is Applied, an object is Used/Held). Never Worn for food or furniture." } } } } },
  { type: "function", function: { name: "request_reference_upload", description: "Ask for and open the reference uploader (a photo of the person the client wants in the shoot).", parameters: { type: "object", properties: { message: { type: "string" } } } } },
  { type: "function", function: { name: "request_product_upload", description: "Ask for and open the product uploader. Only when a product should be worn/held/applied and none is uploaded.", parameters: { type: "object", properties: { message: { type: "string" } } } } },
  { type: "function", function: { name: "show_scene", description: "Reveal the optional scene controls (setting, lighting, mood, composition, format, counts).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "generate_model_shoot", description: "Generate the model photoshoot now. Call once a model is established (built or reference) and a brand floor exists.", parameters: { type: "object", properties: { express: { type: "string", description: "The client's request in THEIR OWN WORDS, verbatim — the primary direction for the shoot (e.g. 'walking through a rainy Tokyo street at night'). ALWAYS fill this with what they actually asked for; it drives the whole shot. If the shoot involves MULTIPLE people, state the number here in words (e.g. 'three models on a beach', 'a group of four friends') so the group is produced." }, background: { type: "string" }, vibe: { type: "string" }, lighting: { type: "string" }, composition: { type: "string" }, format: { type: "string", enum: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"] }, productUse: { type: "string", enum: ["Worn", "Held", "Applied", "Eaten", "Sipped", "Poured", "SatOn", "LoungedOn", "SleptOn", "Used", "Shown", "In-context", "None"], description: "How the model physically interacts with the product — MUST fit the product's category (food is Eaten/Shown, a drink is Sipped, furniture is SatOn/LoungedOn, apparel/jewellery is Worn, beauty is Applied, an object is Used/Held). Never Worn for food or furniture." }, numAngles: { type: "number" }, shotsPerAngle: { type: "number" } } } } },
];

export function activeAgentBrain(): string {
  return process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-6" : process.env.AZURE_OPENAI_DEPLOYMENT ?? "azure-openai";
}

function defaultReply(actions: ModelAgentAction[]): string {
  const a = actions[0];
  if (!a) return "Tell me who you want in frame — build a model on the left, or paste a photo of the person you have in mind.";
  if (a.type === "request_reference_upload") return a.message || "Share a photo of your model and I'll reproduce that exact person — never beautified away.";
  if (a.type === "request_product_upload") return a.message || "Want the product worn or held? Pop its photo in and I'll place it at true scale.";
  if (a.type === "generate_model_shoot") return "On it — shooting your set now. It'll appear on the canvas.";
  if (a.type === "show_scene") return "I've opened the scene controls — set the look, or just say go.";
  if (a.type === "set_model_source") return a.source === "reference" ? "Switched to reference — paste your model's photo." : "Let's build your model on the left.";
  if (a.type === "patch_model") return "Got it — I've set that on your model.";
  return "Got it.";
}

export async function runModelAgent(args: {
  skill: string;
  profile: BrandProfile | null;
  state: ModelConvState;
  messages: ChatMsg[];
  memory?: string; // recalled per-brand agent memory (preferences/facts/summary from past sessions)
}): Promise<{ reply: string; actions: ModelAgentAction[] }> {
  const system = [
    PERSONA,
    `ACTIVE SKILL (governs your craft):\n${args.skill}`,
    args.profile ? `ACTIVE BRAND PROFILE (the floor for every blank):\n${JSON.stringify(args.profile)}` : "BRAND: none yet — the user has no brand profile.",
    ...(args.memory?.trim() ? [args.memory.trim()] : []),
    `CONVERSATION STATE:\n${JSON.stringify(args.state)}`,
  ].join("\n\n---\n\n");

  const r = await chatCreate({
    max_completion_tokens: 4000,
    tools,
    messages: [{ role: "system" as const, content: system }, ...args.messages.map((m) => ({ role: m.role, content: m.content }))],
  });

  const msg = r.choices[0]?.message;
  const actions: ModelAgentAction[] = [];
  for (const tc of msg?.tool_calls ?? []) {
    let a: Record<string, unknown> = {};
    try { a = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
    const name = tc.function.name;
    if (name === "generate_model_shoot") actions.push({ type: "generate_model_shoot", brief: a as ModelShootBrief });
    else if (name === "patch_model") actions.push({ type: "patch_model", spec: a as Partial<ModelSpec> });
    else if (name === "set_model_source") actions.push({ type: "set_model_source", source: (a.source === "reference" ? "reference" : "build") });
    else if (name === "request_reference_upload") actions.push({ type: "request_reference_upload", message: a.message as string | undefined });
    else if (name === "request_product_upload") actions.push({ type: "request_product_upload", message: a.message as string | undefined });
    else if (name === "show_scene") actions.push({ type: "show_scene" });
  }

  const reply = (msg?.content ?? "").trim() || defaultReply(actions);
  return { reply, actions };
}
