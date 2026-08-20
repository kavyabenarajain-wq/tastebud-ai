import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import OpenAI, { toFile } from "openai";
import { runReplicate, firstUrl } from "./replicate";
import { finishInPlace, NEUTRAL_GRADE, editorialModelGrade } from "./finish";
import { chatComplete } from "./openaiClient";
import { putImage } from "./storage";
import { categoryLock, categoryNegatives, categoryLabel, type ProductCategory } from "./productCategory";
import type { FinishGrade, ReferenceDNA } from "./types";

/**
 * The renderer. Renders one shot from a photographer's prompt + the uploaded
 * product image(s), locking to the real product. Provider-swappable:
 *   HIGGSFIELD_API_KEY set → Higgsfield (spec default; adapter below)
 *   OPENAI_API_KEY set      → OpenAI gpt-image-1 (edits the product image → fidelity)
 *   GEMINI_API_KEY set      → Gemini "nano-banana" (v1)
 *   neither                 → mock placeholder (proves the loop, build-step 5)
 * Output PNGs are written to /generated and served by /api/img/<id>.png (a route,
 * because `next start` does not serve files added to /public after build).
 */

const GEN_DIR = join(process.cwd(), "generated");

// Azure image gen needs an IMAGE-model deployment (e.g. gpt-image-1.5) — distinct
// from the chat deployment (gpt-5.5-1). Activates only when one is configured.
function azureImageEnabled(): boolean {
  return !!(process.env.AZURE_IMAGE_DEPLOYMENT && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
}

type Renderer = "higgsfield" | "replicate" | "azure-image" | "openai" | "openrouter" | "gemini" | "mock";

export function activeRenderer(): Renderer {
  // Explicit override — decouples the image provider from the brain's key. Set
  // IMAGE_PROVIDER=gemini to render on Gemini while OpenAI/Azure still drives chat.
  const forced = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (forced === "openrouter" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if ((forced === "azure" || forced === "azure-image") && azureImageEnabled()) return "azure-image";
  if (forced === "replicate" && process.env.REPLICATE_API_TOKEN) return "replicate";
  if (forced === "higgsfield" && process.env.HIGGSFIELD_API_KEY) return "higgsfield";
  // Auto precedence when no (valid) override is set.
  if (process.env.HIGGSFIELD_API_KEY) return "higgsfield";
  if (process.env.REPLICATE_API_TOKEN) return "replicate"; // open-source FLUX Kontext — fast
  if (azureImageEnabled()) return "azure-image"; // use Azure image gen when a deployment is set
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter"; // funded gateway to OpenAI image models
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "mock";
}

// FLUX Kontext (Replicate) is single-image editing. For MULTI-subject frames (model
// identity + product, several distinct products, or explicit style refs) it would drop
// a subject, so we defer those to a multi-image renderer. Single-product frames — the
// common, slow case — get the fast open-source path.
function pickRenderer(multiSubject: boolean): Renderer {
  const r = activeRenderer();
  if (r === "replicate" && multiSubject) {
    if (azureImageEnabled()) return "azure-image";
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.GEMINI_API_KEY) return "gemini";
    return "mock";
  }
  return r;
}

interface Inline { mimeType: string; data: string; }

async function toInline(ref: string): Promise<Inline> {
  const m = ref.match(/^data:(.+?);base64,(.*)$/s);
  if (m) return { mimeType: m[1]!, data: m[2]! };
  if (/^https?:\/\//i.test(ref)) {
    const res = await fetch(ref);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType: ct.startsWith("image/") ? ct : "image/png", data: buf.toString("base64") };
  }
  // Resolve local served paths back to disk (a generated shot reused as a ref).
  let path = ref;
  if (ref.startsWith("/api/img/")) path = join(GEN_DIR, basename(ref));
  else if (ref.startsWith("/")) path = join(process.cwd(), "public", ref);
  const buf = await readFile(path);
  const mimeType = /\.jpe?g$/i.test(ref) ? "image/jpeg" : /\.webp$/i.test(ref) ? "image/webp" : "image/png";
  return { mimeType, data: buf.toString("base64") };
}

async function save(id: string, b64: string): Promise<string> {
  // Blob on serverless (Vercel), local /generated file in dev — see lib/storage.ts.
  return putImage(`${id}.png`, Buffer.from(b64, "base64"));
}

/** Resolve any ref (data URL, http URL, or local served path) to a base64 data URI — for sending to Replicate. */
export async function toDataUri(ref: string): Promise<string> {
  if (/^data:/.test(ref)) return ref;
  const { mimeType, data } = await toInline(ref);
  return `data:${mimeType};base64,${data}`;
}

/** Download a (temporary) remote image URL and persist it under /generated; returns the served path. */
export async function persistRemote(id: string, url: string): Promise<string> {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return save(id, buf.toString("base64"));
}

/** Persist a raw image buffer under /generated (sharp crops/pads); returns the served path. */
export async function persistBuffer(id: string, buf: Buffer): Promise<string> {
  return save(id, buf.toString("base64"));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geminiCall(url: string, body: unknown, tries = 4): Promise<any> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j: any = await res.json();
      if (j.error) {
        const msg = j.error.message ?? "";
        // Billing / auth / bad-model errors are PERMANENT — fail fast instead of retrying for minutes.
        const permanent = [400, 401, 403, 404].includes(Number(j.error.code)) || /credit|billing|prepay|deplet|permission|api key|not found|unsupported|invalid/i.test(msg);
        const transient = !permanent && ([429, 500, 503].includes(Number(j.error.code)) || /internal|overload|unavailable|rate|timeout/i.test(msg));
        if (transient && i < tries - 1) { await sleep(700 * 2 ** i); continue; }
        throw new Error(`Gemini error: ${msg}`);
      }
      return j;
    } catch (e) { last = e; if (i < tries - 1) { await sleep(700 * 2 ** i); continue; } throw e; }
  }
  throw last;
}

function pickImage(j: any): string | null {
  const parts: any[] = j?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  return img ? ((img.inlineData ?? img.inline_data).data as string) : null;
}

async function renderGemini(id: string, prompt: string, products: string[], opts: { aspect?: string; imageSize?: string }): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  const refs = await Promise.all(products.filter(Boolean).map(toInline));
  const parts = [{ text: prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mimeType, data: r.data } }))];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const imageConfig: Record<string, string> = { imageSize: opts.imageSize ?? "2K" };
  if (opts.aspect) imageConfig.aspectRatio = opts.aspect;
  const body = { contents: [{ parts }], generationConfig: { imageConfig } };
  // The image model intermittently returns text-only; retry a few times before failing.
  let b64: string | null = null;
  for (let attempt = 0; attempt < 4 && !b64; attempt++) {
    b64 = pickImage(await geminiCall(url, body));
  }
  if (!b64) throw new Error("Gemini returned no image (after retries)");
  return save(id, b64);
}

// ── OpenAI renderer (gpt-image-1) ──
// gpt-image-1 has fixed output sizes; map our aspect strings onto the nearest one.
function openaiSize(aspect?: string): "1024x1024" | "1024x1536" | "1536x1024" {
  if (aspect?.includes(":")) {
    const [w, h] = aspect.split(":").map(Number);
    if (w && h && w !== h) return w > h ? "1536x1024" : "1024x1536";
    if (w && h) return "1024x1024";
  }
  return "1024x1536"; // default portrait — matches the 4:5 product default
}

// The SDK wants an Uploadable; build one from any ref (data URL, http, local path)
// with an explicit mime type so gpt-image-1 reads it as an image, not octet-stream.
async function toUploadable(ref: string) {
  const { mimeType, data } = await toInline(ref);
  const ext = /png/i.test(mimeType) ? "png" : /webp/i.test(mimeType) ? "webp" : "jpg";
  return toFile(Buffer.from(data, "base64"), `ref.${ext}`, { type: mimeType });
}

// ── RENDER SPEED PROFILE ──────────────────────────────────────────────────────────────────
// gpt-image's wall-clock is dominated by TWO levers: output `quality` and `input_fidelity`.
// input_fidelity:"high" sends ~22× the input-image tokens, which BOTH slows every call AND eats
// the account's per-minute token budget — so a batch of concurrent hero renders queues behind the
// rate limit instead of running in parallel. That is the single biggest reason a 6-shot set takes
// minutes rather than ~one render's worth of wall-clock. RENDER_SPEED picks the trade for the
// interactive grid; a keeper can always be re-rendered at max fidelity via /api/upscale.
// gpt-image's `input_fidelity` is BINARY — the API accepts only "high" or "low" (a 400 on
// anything else); "high" is the 22× tax. So the speed axis is fidelity high↔low, and `quality`
// (low/medium/high) is the second, independent grade knob:
//   fast     → low quality  / low fidelity   — draft grade, fastest, whole set truly parallel
//   balanced → medium quality / low fidelity  — DEFAULT: parallel-fast render, medium detail;
//                                               product drift is caught by the QC reshoot (2 attempts)
//   quality  → high quality / high fidelity   — maximum product fidelity (the old always-on behaviour)
// A per-call opts.inputFidelity (model-likeness forces "high", restage/rotation forces "low") and
// the explicit OPENAI_IMAGE_QUALITY / OPENAI_INPUT_FIDELITY env vars still override the profile.
export function renderSpeed(): "fast" | "balanced" | "quality" {
  const v = (process.env.RENDER_SPEED ?? "balanced").toLowerCase();
  return v === "fast" || v === "quality" ? v : "balanced";
}
function speedProfile(): { quality: "low" | "medium" | "high"; fidelity: "high" | "low" } {
  switch (renderSpeed()) {
    case "fast": return { quality: "low", fidelity: "low" };
    case "quality": return { quality: "high", fidelity: "high" };
    default: return { quality: "medium", fidelity: "low" };
  }
}

// Core image render over the OpenAI SDK — shared by the platform and Azure paths
// (Azure's v1 endpoint speaks the same images API; only client + model differ).
async function renderImageSDK(client: OpenAI, model: string, id: string, prompt: string, products: string[], opts: { aspect?: string; inputFidelity?: string }): Promise<string> {
  const size = openaiSize(opts.aspect);
  const prof = speedProfile();
  // Quality follows the speed profile (balanced → "medium", the snappy-grid default). An explicit
  // OPENAI_IMAGE_QUALITY still wins, and RENDER_SPEED=quality restores "high" everywhere for the
  // "you can read every single thing" bar on a final hero render.
  // Validate the env override against the values the API accepts (mirrors the fidelity clamp) — an
  // empty string or a typo like "hd"/"standard" would otherwise 400 every render. Falls to the profile.
  const qEnv = process.env.OPENAI_IMAGE_QUALITY?.toLowerCase();
  const quality = (qEnv && ["low", "medium", "high", "auto"].includes(qEnv) ? qEnv : prof.quality) as "low" | "medium" | "high" | "auto";
  const refs = products.filter(Boolean);
  // Edit FROM the attached subject image(s) so the real subject is preserved exactly.
  // input_fidelity:"high" is gpt-image-1's lever to hold that subject TRUE — the EXACT face of a
  // pasted model reference (reproduce the person, don't reinterpret them) and the exact product
  // shape/label. ~22× the input-image tokens vs "low" — the main speed tax, so it now follows the
  // RENDER_SPEED profile by default (balanced → "medium") instead of always paying full price.
  // The mini model is the SPEED tier: it doesn't take the high-fidelity lever (and would be
  // slower if it did), so we omit input_fidelity for it — it defaults to low = fastest.
  const isMini = /mini/i.test(model);
  // Per-call override wins: a RESTAGE shot passes "low" so the model rebuilds the reference's scene
  // instead of clinging to the product photo's own background; a model-likeness shot forces "high"
  // to hold the face true. Falls back to the env, then the speed profile. CLAMPED to the only two
  // values the API accepts — anything but "high" (incl. a stray env "medium") becomes "low", so a
  // bad value can never 400 the whole render.
  const rawFidelity = (opts.inputFidelity || process.env.OPENAI_INPUT_FIDELITY || prof.fidelity).toLowerCase();
  const inputFidelity = rawFidelity === "high" ? "high" : "low";
  let d: { b64_json?: string; url?: string } | undefined;
  if (refs.length) {
    const image = await Promise.all(refs.map(toUploadable));
    const editParams = { model, image, prompt, size, quality, ...(isMini ? {} : { input_fidelity: inputFidelity }) } as unknown as Parameters<typeof client.images.edit>[0];
    d = (await client.images.edit(editParams)).data?.[0];
  } else {
    d = (await client.images.generate({ model, prompt, size, quality })).data?.[0];
  }
  if (d?.b64_json) return save(id, d.b64_json);
  if (d?.url) return persistRemote(id, d.url); // some models return a URL instead of b64
  throw new Error("Image model returned no image");
}

// OpenAI platform (api.openai.com). gpt-image-1.5 is newer + markedly faster than
// gpt-image-1 (≈21s vs 68s) with better fidelity; "medium" keeps the grid snappy.
// Bump OPENAI_IMAGE_QUALITY=high (or the model) for a final hero render.
function renderOpenAI(id: string, prompt: string, products: string[], opts: { aspect?: string; inputFidelity?: string }): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return renderImageSDK(client, process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5", id, prompt, products, opts);
}

// Azure image gen — uses the Azure endpoint + key and the AZURE_IMAGE_DEPLOYMENT name.
function renderAzureImage(id: string, prompt: string, products: string[], opts: { aspect?: string; inputFidelity?: string }): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.AZURE_OPENAI_API_KEY, baseURL: process.env.AZURE_OPENAI_ENDPOINT });
  return renderImageSDK(client, process.env.AZURE_IMAGE_DEPLOYMENT!, id, prompt, products, opts);
}

// Open-source renderer via Replicate — FLUX.1 Kontext [dev] by default: fast (~2-8s)
// image-conditioned editing that keeps the product faithful. Single input image (the
// product), so only single-subject frames route here (see pickRenderer). Model id is
// env-overridable (e.g. a Pruna-optimised Kontext build, or qwen/qwen-image-edit).
async function renderReplicate(id: string, prompt: string, refs: string[], opts: { aspect?: string }): Promise<string> {
  const model = process.env.REPLICATE_RENDER_MODEL || "black-forest-labs/flux-kontext-dev";
  const input: Record<string, unknown> = { prompt, output_format: "png", aspect_ratio: opts.aspect || "4:5" };
  const base = refs.filter(Boolean)[0];
  if (base) {
    const dataUri = await toDataUri(base);
    // Replicate validates inputs per-model and 422s on unknown fields, so name the
    // input-image field by model: Nano Banana (google) takes `image_input` as an ARRAY;
    // FLUX Kontext expects `input_image`; Qwen-Image-Edit and most others expect `image`.
    // Override the scalar key with REPLICATE_IMAGE_INPUT_KEY if a pinned build differs.
    if (/nano-banana|google\//i.test(model)) {
      input.image_input = [dataUri];
    } else {
      const key = process.env.REPLICATE_IMAGE_INPUT_KEY || (/kontext|flux/i.test(model) ? "input_image" : "image");
      input[key] = dataUri;
    }
  }
  const url = firstUrl(await runReplicate(model, input));
  if (!url) throw new Error("Replicate returned no image");
  return persistRemote(id, url);
}

/** Vision QC: score a rendered shot, and (if given the original) verify the product wasn't altered. */
/**
 * Run a vision judgement (prompt + ordered images) and return the raw model text. Tries the
 * FUNDED OpenAI/Azure vision client first — so QC actually runs in production (the old Gemini-
 * only path no-op'd whenever GEMINI_API_KEY was absent, silently passing every shot) — then
 * falls back to Gemini. Images are referenced as "IMAGE 1..N" in the prompt, in the given order.
 */
async function visionJudge(prompt: string, imageSrcs: string[]): Promise<string | null> {
  if (process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY) {
    try {
      const imgs = await Promise.all(imageSrcs.map((s) => toDataUri(s)));
      const content = [
        { type: "text", text: prompt },
        ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
      ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
      const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 600, reasoning_effort: "low" });
      if (out && out.trim()) return out;
    } catch {
      /* fall through to Gemini */
    }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const key = process.env.GEMINI_API_KEY!;
      const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
      const imgs = await Promise.all(imageSrcs.map(toInline));
      const parts: any[] = [{ text: prompt }, ...imgs.map((im) => ({ inline_data: { mime_type: im.mimeType, data: im.data } }))];
      const j = await geminiCall(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { contents: [{ parts }] }, 2);
      return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    } catch {
      /* fall through to null */
    }
  }
  return null;
}

/**
 * GROUP CASTING QC — the fix for "3–4 person shots get ZERO likeness verification". The single-
 * identity gate in qcImage is skipped for groups (comparing N faces to one reference would false-
 * fail people 2..N), so a blended, duplicated, missing or mismatched face used to sail through with
 * nothing but prompt negatives. This runs ONE vision call with every person's reference (in order)
 * plus the generated group shot, and fails if the roster is wrong. Best-effort / fail-OPEN (a vision
 * hiccup never drops a good group shot) and retried once, matching qcImage's philosophy.
 */
export async function qcGroupLikeness(args: { url: string; people: { name?: string; refs: string[] }[]; brand: string }): Promise<{ pass: boolean; reasons: string[] }> {
  const people = args.people.map((p) => ({ name: p.name, ref: (p.refs ?? []).filter(Boolean)[0] })).filter((p) => p.ref);
  if (people.length < 2) return { pass: true, reasons: [] };
  const n = people.length;
  const roster = people.map((p, i) => `PERSON ${i + 1}${p.name ? ` (${p.name})` : ""} = IMAGE ${i + 1}`).join("; ");
  const prompt =
    `You are a STRICT casting QC reviewer for the brand "${args.brand}". IMAGES 1..${n} are the reference photos of ${n} DISTINCT people: ${roster}. IMAGE ${n + 1} is a generated GROUP photo that must show ALL ${n} of those SAME people together.\n` +
    `FAIL if: any of the ${n} reference people is MISSING; any face is BLENDED, averaged, duplicated, cloned or swapped between people; the same person appears more than once; there are more or fewer than ${n} people; or any person does not clearly match their own reference (face, and where visible hair, build and skin tone).\n` +
    `Do NOT penalise a different pose, wardrobe, background, camera angle or lighting. When all ${n} distinct people are clearly present and each matches their reference, pass.\n` +
    `Return STRICT JSON ONLY: {"pass":true|false,"reasons":["short reason", ...]}`;
  try {
    for (let vAttempt = 0; vAttempt < 2; vAttempt++) {
      const raw = await visionJudge(prompt, [...people.map((p) => p.ref), args.url]);
      const m = raw?.match(/\{[\s\S]*\}/);
      if (!m) continue;
      try { const parsed = JSON.parse(m[0]); return { pass: !!parsed.pass, reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [] }; } catch { /* garbled — retry */ }
    }
  } catch { /* fall through to fail-open */ }
  return { pass: true, reasons: [] };
}

export async function qcImage(args: { url: string; checklist: string[]; brand: string; productRef?: string; modelRef?: string; restage?: boolean; manifest?: string[]; cleanPlate?: boolean; category?: ProductCategory }): Promise<{ pass: boolean; reasons: string[]; categoryOk?: boolean }> {
  try {
    // Ordered reference images → "IMAGE 1..N"; the GENERATED frame under review is ALWAYS last.
    const refSrcs: string[] = [];
    if (args.modelRef) refSrcs.push(args.modelRef);
    if (args.productRef) refSrcs.push(args.productRef);
    const genIdx = refSrcs.length + 1; // the generated frame's IMAGE index
    const checklist = args.checklist.length
      ? args.checklist
      : ["Real photography, not a 3D/CGI/plastic/AI render", "Product, label and text intact and legible", "On-brand, professional, well-composed", "Background and lighting look intentional and clean"];
    // Manifest check — every element the vision pass read off the REAL product must survive into
    // the shot. Angle-tolerant: an element on a face the camera can't see is not a failure.
    const manifestClause = args.productRef && args.manifest?.length
      ? `EVERY ONE of these elements is printed on the REAL product and must be PRESENT, complete and LEGIBLE in the generated photo — FAIL if any visible one is missing, cut off, blurred, garbled, misspelled, translated or altered: ${args.manifest.slice(0, 20).join(" | ")}. (Ignore only an element on a face of the pack genuinely not visible at this camera angle.)\n`
      : "";
    // OBJECT-CLASS gate — the client's product must still be the SAME KIND of object. This is a hard
    // fail even in restage mode (where shape/arrangement may otherwise change). Emits categoryOk so
    // the caller can fail-CLOSED on a category miss (drop the shot) even when the soft QC gate is off.
    const categoryClause = args.productRef && args.category && categoryLabel(args.category)
      ? `OBJECT-CLASS CHECK — the client's product IS ${categoryLabel(args.category)}. The hero product in the generated photo MUST still be that same class of object. FAIL, and set "categoryOk":false, if it has been turned into a DIFFERENT kind of object (e.g. a garment rendered as a bottle, cup, jar or perfume; a drink rendered as a solid food; a product rendered as furniture). Otherwise set "categoryOk":true. This applies even in restage mode. Include "categoryOk" in your JSON.\n`
      : "";
    // When the object-class check is active, put categoryOk in the return-JSON SCHEMA too — otherwise the
    // judge follows the template and drops the field, and the fail-closed gate silently fails open.
    const catField = categoryClause ? `"categoryOk":true|false,` : "";
    // Anti-cliché + clean-plate backstops — the render prompt bans these, but without a gate a
    // floating-on-a-plinth-in-a-void frame or a baked-in headline would sail through QC.
    const cliches = "Also FAIL on any tell of cheap AI staging in the generated image: the product floating on a pedestal/podium/plinth, a seamless gradient-void background, a concentric spotlight halo, random scattered cubes/spheres/pebbles, fake confetti bokeh, or a plastic/CGI-render look — a real photograph has a real surface, a real contact shadow and physically plausible light.\n";
    const cleanPlateClause = args.cleanPlate ? "CLEAN PLATE — copy is overlaid later, so the render itself must carry NO added text: FAIL if the generated image contains ANY headline, tagline, slogan, caption, sign, sticker, badge, watermark or word spelled out of any material anywhere in the scene. The ONLY text permitted is the text physically printed on the product itself.\n" : "";
    let prompt: string;
    if (args.modelRef) {
      const productClause = args.productRef
        ? `IMAGE 2 is the client's REAL product. The product in IMAGE ${genIdx} MUST be that SAME product — same shape, cap/closure, label, logo, every word of text and colours (ignore any hand, prop or background in IMAGE 2). A different, restyled or relabelled product is a FAIL.\n${manifestClause}`
        : "";
      const checks = args.checklist.length
        ? `\nIMAGE ${genIdx} must ALSO satisfy ALL of these — fail if any is false:\n` + args.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + `\n`
        : "";
      prompt =
        `You are a STRICT model-photography QC reviewer for the brand "${args.brand}".\n` +
        `IMAGE 1 is a LIKENESS REFERENCE of the client's model — the real person who must appear in the shoot. IMAGE ${genIdx} is the GENERATED photo under review.\n` +
        `THE CENTRAL TEST — LIKENESS: the person in IMAGE ${genIdx} must be UNMISTAKABLY THE SAME INDIVIDUAL as in IMAGE 1. Compare face shape, eye shape and spacing, nose bridge and tip, lips and mouth width, jawline and chin, brow, hairline and hair, skin tone, and any distinguishing marks (freckles, moles, facial hair). A different-looking person — even a more conventionally attractive or more on-brand one — is a FAIL. A mere resemblance or "same vibe" is a FAIL.\n` +
        `IGNORE differences in expression, pose, camera angle, distance, lighting, wardrobe, hair styling and background — those are ALLOWED to change; judge only whether it is the same human being.\n` +
        `FLAWS PRESERVED: the person's real skin texture and distinguishing marks from IMAGE 1 — pores, freckles, moles, scars, a cut or blemish, fine lines, under-eye shadows and natural asymmetry — must be PRESERVED. FAIL if they have been smoothed away, airbrushed, healed, evened-out or beautified into a cleaner, more symmetrical or more flawless face; a visibly retouched, poreless or idealised version of the person is NOT the same person.\n` +
        productClause +
        categoryClause +
        `Also fail if IMAGE ${genIdx} looks distorted, waxy, plastic or obviously AI-generated, or has broken hands or anatomy.${checks}` +
        `When the person is clearly the same individual${args.productRef ? " and the product matches" : ""} and the photo is clean, pass.\n` +
        `Return STRICT JSON ONLY: {"pass":true|false,${catField}"reasons":["short reason", ...]}`;
    } else if (args.productRef) {
      const extra = args.checklist.length ? `\nADDITIONALLY, for IMAGE 2 ALL of the following must be TRUE — fail if any is false:\n` + args.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + `\n` : "";
      // Restage mode (a style reference is driving the shot): the product may be legitimately
      // RE-FORMED to fit the reference's arrangement — a duvet cased into pillows, a garment
      // folded or stacked — so we must NOT fail on a changed shape/silhouette/count. Identity
      // here = the FABRIC, PRINT, PATTERN and COLOURWAY, which must stay exact.
      prompt = args.restage
        ? `You are a STRICT product-photography QC reviewer for the brand "${args.brand}".\n` +
          `IMAGE 1 is the ORIGINAL product the client uploaded. IMAGE 2 is a generated photo that RESTAGES that product into a new scene/composition (a style reference was used).\n` +
          `IMAGE 1 may also contain a hand, props, a room or a background — IGNORE all of that and compare ONLY the product's FABRIC and DESIGN.\n` +
          `This is a RESTAGE: the product MAY be re-formed to suit the new scene (e.g. bedding shown as stacked pillows, a garment folded or draped), and it MAY appear at a different size, count, fold or arrangement — do NOT fail on any of that, nor on a different camera angle, background, lighting or number of items.\n` +
          `FAIL ONLY if the product's IDENTITY changed: its pattern, print, motif, check/stripe, colourway, material/weave, logo or any text/wording differs from IMAGE 1, OR the print looks recoloured or restyled to match the reference, OR IMAGE 2 looks distorted, fake, melted or obviously AI-generated.\n` +
          `ALSO FAIL if IMAGE 2 shows a SECOND, DIFFERENT hero product that is not the client's, or keeps a serving vessel/holder (glass, cup, cone, bowl, plate, saucer, tray, stand, jar, wrapper) that belongs to some OTHER product rather than the client's — the client's product must be the SOLE hero, with no foreign product and no leftover serving-ware from the reference. (This does NOT apply to the client's OWN product legitimately re-formed into multiple pieces, e.g. bedding shown as several pillows — that is fine.)\n` +
          categoryClause +
          `When the SAME fabric/print/colourway clearly appears in IMAGE 2 and the photo is clean, pass.\n` +
          `Return STRICT JSON ONLY: {"pass":true|false,${catField}"reasons":["short reason", ...]}`
        : `You are a STRICT photography QC reviewer for the brand "${args.brand}".\n` +
          `IMAGE 1 is the ORIGINAL product the client uploaded. IMAGE 2 is a generated photo of it in a new scene.\n` +
          `IMAGE 1 may also contain a hand, fingers, nails, props or a background — IGNORE all of that and compare ONLY the product object itself.\n` +
          `FAIL if the PRODUCT in IMAGE 2 differs from the product in IMAGE 1 in shape, silhouette, proportions, cap/closure, label, logo, any text/wording, or colours — it must be the SAME product, only in a new setting.\n` +
          manifestClause +
          categoryClause +
          cliches +
          cleanPlateClause +
          `Also fail if IMAGE 2 looks distorted, fake, melted or obviously AI-generated, OR if it reproduces a hand/fingers/background copied from IMAGE 1. Do NOT penalise a different camera angle, background or lighting.${extra}` +
          `When the product clearly matches and the photo is clean, pass.\n` +
          `Return STRICT JSON ONLY: {"pass":true|false,${catField}"reasons":["short reason", ...]}`;
    } else {
      prompt =
        `You are a STRICT product-photography QC reviewer for the brand "${args.brand}". Judge ONE image on its own merits against:\n` +
        checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n" +
        cliches + cleanPlateClause +
        `Fail ONLY if the product looks distorted, fake, warped, melted, mislabelled, or obviously AI-generated. When in doubt, pass.\n` +
        `Return STRICT JSON ONLY: {"pass":true|false,${catField}"reasons":["short reason", ...]}`;
    }
    // Try the vision judge up to TWICE before failing open. A transient null reply or a garbled,
    // non-JSON answer (the judge runs at reasoning_effort "low") should NOT silently pass a bad
    // shot on the first hiccup — retry once. Only when BOTH tries yield nothing usable do we fail
    // open (an unreachable / persistently-garbled judge must never block a whole shoot).
    for (let vAttempt = 0; vAttempt < 2; vAttempt++) {
      const raw = await visionJudge(prompt, [...refSrcs, args.url]);
      const m = raw?.match(/\{[\s\S]*\}/);
      if (!m) continue; // null or no JSON object → retry
      try {
        const parsed = JSON.parse(m[0]);
        const categoryOk = typeof parsed.categoryOk === "boolean" ? parsed.categoryOk : undefined;
        return { pass: !!parsed.pass, reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [], categoryOk };
      } catch { /* garbled JSON — fall through and retry once */ }
    }
    return { pass: true, reasons: [] }; // judge unreachable / garbled on both tries → don't block the shoot
  } catch {
    return { pass: true, reasons: [] };
  }
}

/**
 * Vision pre-pass: LOOK at the uploaded product and report its observed facts so the
 * (otherwise blind) art director + renderer can key the scene to the REAL product and
 * reproduce it exactly. Reports three things:
 *   • colours   — the packaging colours a designer would key a campaign to
 *   • identity  — one line: WHAT the product actually is (so we never render a different one)
 *   • elements  — a MANIFEST of everything printed/embossed on the pack (verbatim text,
 *                 logos, claims, seals, net weight, icons) so nothing is dropped or invented
 * Accepts one image or several (e.g. front + back panels), so multi-panel text is captured.
 * Runs on the FUNDED chat/vision client (OpenAI/Azure) — the older Gemini path was dead in
 * production, so the manifest never actually ran; this makes it real. Best-effort: falls back
 * to Gemini if that's the only key, and returns null on any failure (callers degrade to brand
 * palette text + the generic legibility rule, as before).
 */
export type ProductObservation = {
  colors: { name: string; hex: string; role: string }[];
  material: string;
  summary: string;
  identity?: string;    // one line — what this product actually is (form, size/volume, category)
  category?: string;    // the object CLASS read off the image (apparel/beauty/food/…), for the category lock
  elements?: string[];  // every distinct on-pack element (text reproduced verbatim), for the must-appear manifest
  parts?: string[];     // physical packaging parts (cap/closure, front panel, back panel, base) + which carry text
};

const PRODUCT_INSPECT_PROMPT =
  `You are a forensic product-packaging analyst prepping a photoshoot. Look ONLY at the product/packaging in the image(s) — IGNORE any hand, fingers, prop, surface or background around it. Report, precisely and LITERALLY, everything that is ON the product so a photographer can reproduce it EXACTLY and omit nothing. Reproduce any text VERBATIM. Report ONLY what you can actually see — never guess, invent or flatter.\n` +
  `Return STRICT JSON ONLY:\n` +
  `{"identity":"one line — what this product actually is: form factor, printed size/volume if shown, category (e.g. '250ml frosted-glass bottle of cold-pressed green juice')",` +
  `"category":"the single best object-CLASS label for this product from EXACTLY this list — apparel (clothing/footwear/worn accessory), jewellery, beauty (cosmetics/skincare/fragrance), wellness (supplements), food, drink, furniture, tech (electronics), home (homeware/decor), or general if genuinely none fit. Judge by what the OBJECT physically IS, not by branding.",` +
  `"colors":[{"name":"plain colour name","hex":"#RRGGBB","role":"primary|accent|cap|text|background"}],` +
  `"material":"main material/finish (e.g. frosted glass, matte aluminium tube, glossy carton)",` +
  `"elements":["EVERY distinct thing printed or embossed on the pack, each as its own short item, text in double quotes — the brand wordmark, the product name, the variant/flavour, every tagline/claim, certifications & seals, net weight/volume, ingredient or benefit callouts, icons/symbols, and any legible fine print"],` +
  `"parts":["the physical parts visible or clearly implied — cap/closure, neck, front label panel, back panel, base — noting which carry text"],` +
  `"summary":"one line"}\n` +
  `Order colours by visual dominance, primary first. Be EXHAUSTIVE on "elements": list each separate line of text as its own item; if two images show different faces, merge everything visible across them.`;

export async function analyzeProduct(productRef: string | string[]): Promise<ProductObservation | null> {
  const refs = (Array.isArray(productRef) ? productRef : [productRef]).filter(Boolean).slice(0, 3);
  if (!refs.length) return null;
  // Preferred path: the funded OpenAI/Azure vision client, which actually runs in production.
  const parseInto = (raw: string): ProductObservation | null => {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
    const str = (v: unknown) => String(v ?? "").trim();
    const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
    const colors = (Array.isArray(parsed.colors) ? parsed.colors : [])
      .map((c: any) => ({ name: str(c?.name), hex: str(c?.hex), role: str(c?.role) }))
      .filter((c: any) => c.name || c.hex)
      .slice(0, 6);
    const elements = arr(parsed.elements).slice(0, 30);
    const parts = arr(parsed.parts).slice(0, 12);
    const identity = str(parsed.identity) || undefined;
    const category = str(parsed.category) || undefined;
    // A run with no colours AND no manifest saw nothing usable → null (caller falls back).
    if (!colors.length && !elements.length && !identity) return null;
    return { colors, material: str(parsed.material), summary: str(parsed.summary), identity, category, elements: elements.length ? elements : undefined, parts: parts.length ? parts : undefined };
  };
  try {
    if (process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY) {
      const imgs = await Promise.all(refs.map((r) => toDataUri(r)));
      const content = [
        { type: "text", text: PRODUCT_INSPECT_PROMPT },
        ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
      ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
      const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 1400, reasoning_effort: "low" });
      const res = parseInto(out ?? "");
      if (res) return res;
    }
  } catch {
    /* fall through to Gemini */
  }
  // Fallback path: Gemini vision, for deployments configured that way.
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
    const parts = await Promise.all(refs.map(toInline));
    const body = { contents: [{ parts: [{ text: PRODUCT_INSPECT_PROMPT }, ...parts.map((p) => ({ inline_data: { mime_type: p.mimeType, data: p.data } }))] }] };
    const j = await geminiCall(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, body, 2);
    const text: string = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    return parseInto(text);
  } catch {
    return null;
  }
}

/**
 * MODEL LIKENESS + FLAW MANIFEST — the person-facing twin of analyzeProduct. When the client pastes
 * a reference photo of a real person, LOOK at them and report, forensically, their exact likeness AND
 * every real distinguishing mark and imperfection (a small cut, scar, blemish, mole, freckles, pores,
 * fine lines, under-eye texture, asymmetry, …) so the renderer reproduces THAT exact individual —
 * flaws included, VISIBLE, never beautified into a cleaner stranger. In-context pixel editors
 * (gpt-image edit / FLUX Kontext) carry the real pixels; this manifest is the belt-and-braces that
 * stops the model quietly healing and idealising the face at high fidelity. Best-effort: null on any
 * failure (the render still leans on the identity-lock prose + input_fidelity:high).
 */
export type ModelObservation = {
  likeness: string;    // the exact face + head geometry, hair, build — one dense paragraph
  features: string[];  // exhaustive manifest of every distinguishing mark, texture and flaw to reproduce visibly
  summary?: string;
};

const MODEL_INSPECT_PROMPT =
  `You are a forensic portrait analyst prepping a photoshoot that must reproduce THIS EXACT person with total fidelity — a precise likeness, NEVER a flattering lookalike. Look ONLY at the person; IGNORE the background, clothing, props and anything they are holding or wearing. Report, precisely and literally, everything that makes them unmistakably themselves so a photographer can reproduce them EXACTLY and beautify NOTHING. Report ONLY what you can actually see — never guess, invent or flatter, and never omit an unflattering detail.\n` +
  `Return STRICT JSON ONLY:\n` +
  `{"likeness":"2-4 dense sentences: exact face and head shape; hairline, hair colour/texture/length/parting; forehead; brow shape, thickness and spacing; eye shape/size/spacing/colour and lids; nose bridge, width and tip; cheekbones; lips shape and mouth width; jawline; chin; ears; neck; skin tone and undertone; apparent age; build",` +
  `"features":["EVERY distinct distinguishing mark, texture and IMPERFECTION, each as its own short item, and note WHERE it is — e.g. 'a small healing cut on the left eyebrow', 'a mole below the right corner of the mouth', 'freckles scattered across the nose and cheeks', 'visible pores and slight redness on the cheeks', 'faint under-eye shadows', 'fine forehead lines', 'a small chickenpox-type scar on the chin', 'stubble along the jaw', 'a chipped upper-left tooth', 'the left eye sits slightly lower than the right'. Include: scars, cuts, grazes, healing scabs, stitches, bruises, blemishes, spots/acne, moles, birthmarks, freckles, pores and skin texture, fine lines and wrinkles, under-eye bags/shadows, tan lines, uneven skin tone or redness, facial hair/stubble, stray/flyaway hairs, eyebrow gaps, gap/crooked/chipped teeth, dimples, piercings, tattoos and their exact placement, glasses, and every visible left-right asymmetry. Be EXHAUSTIVE and unflinching — list the unflattering details, never skip them"],` +
  `"summary":"one line — who this person is at a glance"}\n` +
  `Be EXHAUSTIVE on "features": a real face carries many, and missing them is exactly what turns a render into a different, beautified person.`;

export async function analyzeModelRef(modelRef: string | string[]): Promise<ModelObservation | null> {
  const refs = (Array.isArray(modelRef) ? modelRef : [modelRef]).filter(Boolean).slice(0, 2);
  if (!refs.length) return null;
  const parseInto = (raw: string): ModelObservation | null => {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
    const str = (v: unknown) => String(v ?? "").trim();
    const features = (Array.isArray(parsed.features) ? parsed.features : []).map((x: unknown) => str(x)).filter(Boolean).slice(0, 30);
    const likeness = str(parsed.likeness);
    if (!likeness && !features.length) return null; // saw nothing usable → caller degrades to prose lock
    return { likeness, features, summary: str(parsed.summary) || undefined };
  };
  try {
    if (process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY) {
      const imgs = await Promise.all(refs.map((r) => toDataUri(r)));
      const content = [
        { type: "text", text: MODEL_INSPECT_PROMPT },
        ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
      ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
      const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 1200, reasoning_effort: "low" });
      const res = parseInto(out ?? "");
      if (res) return res;
    }
  } catch {
    /* fall through to Gemini */
  }
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
    const parts = await Promise.all(refs.map(toInline));
    const body = { contents: [{ parts: [{ text: MODEL_INSPECT_PROMPT }, ...parts.map((p) => ({ inline_data: { mime_type: p.mimeType, data: p.data } }))] }] };
    const j = await geminiCall(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, body, 2);
    const text: string = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    return parseInto(text);
  } catch {
    return null;
  }
}

/** Format a ModelObservation into the manifest string renderModelShot injects (likeness + flaws). */
export function modelManifestText(obs: ModelObservation | null): string | undefined {
  if (!obs) return undefined;
  const parts: string[] = [];
  if (obs.likeness) parts.push(`FACE & BUILD: ${obs.likeness}`);
  if (obs.features.length) parts.push(`MARKS & FLAWS TO KEEP VISIBLE:\n- ${obs.features.join("\n- ")}`);
  const out = parts.join("\n");
  return out.trim().length ? out : undefined;
}

/**
 * BRAND-LOOK VISION PASS — the fix for "the model never learns how the brand shoots".
 * The brand's photographic rulebook only reaches the PLANNER (as prose), and in production the
 * research-time vision extraction degrades to a generic category fallback — so the renderer sees
 * neither the brand's real frames nor a true read of their look. This studies the brand's OWN
 * published photos at generation time on the FUNDED client and writes a concrete shooting spec
 * the renderer applies directly, so a new shot could sit unnoticed in the brand's real feed.
 * Best-effort: null on any failure (caller then leans on the planner prose + colour grade).
 */
export async function describeBrandLook(brandPhotos: string[]): Promise<string | null> {
  const refs = (brandPhotos ?? []).filter(Boolean).slice(0, 4);
  if (!refs.length) return null;
  if (!process.env.OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) return null;
  try {
    const imgs = await Promise.all(refs.map((r) => toDataUri(r)));
    const prompt =
      "You are a photography director studying a brand's OWN published photos so new images can match their feed exactly. " +
      "Look ONLY at the recurring PHOTOGRAPHIC signature across these frames — NOT the specific products in them. " +
      "In 4–7 tight, concrete sentences a photographer could execute, capture: (1) the background/environment world and the surfaces they shoot on; " +
      "(2) light — quality (hard/soft), direction, time of day; (3) the colour grade and palette feel; (4) styling and prop density; " +
      "(5) camera feel — lens/crop/distance and depth of field; (6) any signature move they repeat. " +
      "Use a photographer's language only — never marketing words like 'premium' or 'high quality'. No preamble, no headings, no mention of the specific products.";
    const content = [
      { type: "text", text: prompt },
      ...imgs.map((url) => ({ type: "image_url", image_url: { url } })),
    ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
    const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 900, reasoning_effort: "low" });
    const t = (out ?? "").trim();
    return t.length > 20 ? t : null;
  } catch {
    return null;
  }
}

/**
 * STYLE-REFERENCE VISION PASS — the fix for "references are ignored". gpt-image follows a
 * TEXT scene strongly but barely conditions on a second reference IMAGE, so a pasted
 * reference quietly does nothing on the OpenAI path (the planner's invented scene wins).
 * This turns the reference photo into WORDS — a precise shot spec of its scene/look — which
 * renderShot then uses as the authoritative scene, so gpt-image actually recreates it.
 * Runs on the funded OpenAI/Azure chat client (Gemini's vision key is dead). Best-effort:
 * null on any failure → caller falls back to the image-only restage.
 */
export async function describeReferenceScene(ref: string): Promise<string | null> {
  if (!ref) return null;
  try {
    const dataUri = await toDataUri(ref);
    const prompt =
      "You are a photography art director. Look at this REFERENCE photo and write a precise SHOT SPEC another photographer could follow to recreate its LOOK with a DIFFERENT product. Cover, concretely: " +
      "(1) COMPOSITION & CROP — where the hero object sits in the frame, its orientation/tilt, the framing and negative space; " +
      "(2) CAMERA — angle, height, distance, lens feel, depth of field; " +
      "(3) SETTING & SURFACE — the background/environment and the exact surface or medium the product sits on, in or against; " +
      "(4) PROPS & STAGING — any surrounding elements and how they are arranged; " +
      "(5) LIGHT — direction, quality (hard/soft), time of day, shadows, reflections; " +
      "(6) COLOUR & MOOD — palette, grade and overall feeling. " +
      "CRUCIAL — SEPARATE THE SET FROM THE SERVING. The SET is the reusable environment: backdrop, table/surface, room, furniture, light, atmosphere and unrelated background props — describe it precisely so it can be rebuilt. The SERVING is the reference's OWN hero item AND any vessel, holder or plating that exists only to present it — a glass, cup, cone, bowl, plate, saucer, tray, stand, dish, jar or wrapper. For the SERVING, describe ONLY the empty position, footprint and scale it occupies in the frame — NOT its shape, material, colour or contents — because a DIFFERENT product will take that place. Never present the original hero or its vessel as something to reproduce. " +
      "Do NOT describe the specific product, its brand, label, text or colours — ONLY the scene and style around it. Write 5–9 tight, concrete, visual sentences with no preamble and no headings.";
    const content = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUri } },
    ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
    const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 1600, reasoning_effort: "low" });
    const t = (out ?? "").trim();
    return t.length > 20 ? t : null;
  } catch {
    return null;
  }
}

/**
 * REFERENCE CAMPAIGN DNA — the fix for "references are shitty". The old path collapsed a
 * reference into ONE literal scene and cloned it across the whole set, so a "Tom Ford"
 * reference produced six near-identical frames instead of a campaign. This studies the
 * client's reference image(s) and distils their reusable photoshoot VIBE — light, grade,
 * palette, set, styling, camera, finish — plus a handful of DISTINCT shot concepts that live
 * in that world. The planner then designs a VARIED, brand-rooted set from it; the renderer
 * applies it as a per-shot style layer while each frame keeps its own composition.
 *
 * It deliberately SEPARATES the reusable style from the reference's own product/subject: the
 * DNA never carries the reference's product, label, text or its specific product colours — only
 * the world around it — so the client's real product/brand palette is never overwritten.
 * Reads MULTIPLE references (up to 4) so a whole moodboard resolves to one coherent campaign.
 * Runs on the funded OpenAI/Azure vision client (Gemini is disabled). Best-effort: null on any
 * failure → the caller falls back to the brand's own look.
 */
const REFERENCE_CAMPAIGN_PROMPT =
  "You are the art director of a world-class advertising campaign. The client handed you these REFERENCE image(s) and said: \"make my brand's campaign feel like THIS\". Study them together and distil the ONE reusable PHOTOSHOOT VIBE they share — the campaign's signature — so a DIFFERENT brand and a DIFFERENT product can be shot in the same world.\n" +
  "SEPARATE STYLE FROM SUBJECT. Describe ONLY the reusable art direction — never the reference's own hero product, its label, wording, logo or its specific product colours. A different product will take its place, so its colours and identity are irrelevant; capture the WORLD around it, not the thing itself.\n" +
  "Write in a photographer's concrete language — real cameras, lenses, light behaviour, surfaces, grades — never marketing words like 'premium', 'luxury' or 'high quality'. Be specific and executable.\n" +
  "Return STRICT JSON ONLY:\n" +
  "{" +
  "\"vibe\":\"one vivid line naming the campaign's emotional / editorial register and era (e.g. 'dark, sensual, high-contrast fragrance editorial with 90s film grain')\"," +
  "\"light\":\"the lighting philosophy: quality (hard/soft), direction, contrast ratio, key-to-fill, how shadows fall and where highlights sit\"," +
  "\"palette\":\"the COLOUR GRADE and palette feel as a grade a colourist could dial in — warmth, saturation, black point, dominant and accent tones of the WORLD (never the reference product's own colours)\"," +
  "\"set\":\"the set / environment / surfaces / world: where it is shot, the materials and backdrops, the sense of place and depth\"," +
  "\"styling\":\"the prop and styling density and philosophy — minimal and sculptural, or rich and layered — and what kind of supporting elements belong\"," +
  "\"camera\":\"the camera language: lens and focal length feel, distance, crop habits, depth of field, and the recurring compositional moves\"," +
  "\"finish\":\"the texture / grain / film-or-digital finish and any signature post-treatment\"," +
  "\"shotIdeas\":[\"6-7 DISTINCT shot concepts that all live in this exact world but are genuinely different from each other — vary the angle, distance, composition and moment (e.g. a tight sensual macro, a wide atmospheric environmental frame, a dramatic low hero, a hand-in-scene detail, a flat-lay still-life). Each item is one concrete sentence describing the framing + moment, NOT the product.\"]" +
  "}";

export async function describeReferenceCampaign(refs: string[]): Promise<ReferenceDNA | null> {
  const imgs = (refs ?? []).filter(Boolean).slice(0, 4);
  if (!imgs.length) return null;
  if (!process.env.OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) return null;
  const parse = (raw: string): ReferenceDNA | null => {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let p: any;
    try { p = JSON.parse(m[0]); } catch { return null; }
    const s = (v: unknown) => String(v ?? "").trim();
    const ideas = (Array.isArray(p.shotIdeas) ? p.shotIdeas : []).map((x: unknown) => s(x)).filter(Boolean).slice(0, 8);
    const dna: ReferenceDNA = {
      vibe: s(p.vibe), light: s(p.light), palette: s(p.palette), set: s(p.set),
      styling: s(p.styling), camera: s(p.camera), finish: s(p.finish), shotIdeas: ideas,
    };
    // Nothing usable read → null so the caller falls back to the brand's own look.
    if (!dna.vibe && !dna.light && !dna.set && !ideas.length) return null;
    return dna;
  };
  try {
    const dataUris = await Promise.all(imgs.map((r) => toDataUri(r)));
    const content = [
      { type: "text", text: REFERENCE_CAMPAIGN_PROMPT },
      ...dataUris.map((url) => ({ type: "image_url", image_url: { url } })),
    ] as unknown as OpenAI.Chat.ChatCompletionUserMessageParam["content"];
    const out = await chatComplete({ messages: [{ role: "user", content }], max_completion_tokens: 1600, reasoning_effort: "low" });
    return parse(out ?? "");
  } catch {
    return null;
  }
}

/** The reference DNA as tight prose lines — shared by the planner (art-direction spine) and the renderer (style layer). */
export function referenceDNALines(dna: ReferenceDNA): string {
  const L: string[] = [];
  if (dna.vibe) L.push(`• VIBE: ${dna.vibe}`);
  if (dna.light) L.push(`• LIGHT: ${dna.light}`);
  if (dna.palette) L.push(`• COLOUR GRADE: ${dna.palette}`);
  if (dna.set) L.push(`• SET / WORLD: ${dna.set}`);
  if (dna.styling) L.push(`• STYLING: ${dna.styling}`);
  if (dna.camera) L.push(`• CAMERA: ${dna.camera}`);
  if (dna.finish) L.push(`• FINISH: ${dna.finish}`);
  return L.join("\n");
}

/**
 * The renderer-facing STYLE LAYER built from the reference DNA. Unlike the old refScene block
 * (which rebuilt ONE scene and demoted the planned shot), this rides ON TOP of the planned,
 * per-shot composition: it dictates only the campaign's light / grade / palette / set-feel /
 * styling / camera-feel / finish, so the set stays VARIED while every frame unmistakably shares
 * the reference's vibe. The product stays pixel-locked; the reference's own product is never copied.
 */
function referenceDNABlock(dna: ReferenceDNA, forModel: boolean): string {
  const subject = forModel ? "the model and product" : "the product";
  return (
    `\n\nREFERENCE CAMPAIGN LOOK — the client gave a reference and asked for a campaign in ITS photoshoot vibe. This shot MUST feel like it belongs to that campaign. Apply this signature to the WORLD of the frame — its light, colour grade, palette, set feel, styling density, camera feel and finish — while keeping THIS shot's own composition, angle and moment (from the brief above): do NOT collapse the set toward one repeated frame.\n${referenceDNALines(dna)}\n` +
    `Where this campaign look and the generic film/camera recipe elsewhere in this brief disagree on grade, contrast, warmth, hardness of light or depth of field, THIS campaign look WINS. But it governs only the LOOK — it must NEVER change ${subject}'s identity, and you must NOT copy the reference's own hero product, its shape, label, wording, logo or its specific product colours into this frame; the product comes only from the attached product image, reproduced exactly, and its colours stay its own. Root the result in this brand: keep the brand's real palette and voice inside the reference's grade.`
  );
}

/**
 * Open-source style-transfer path for references (FLUX Kontext / an IP-adapter style model on
 * Replicate). It ATTACHES the reference image so an image-conditioned open model transfers the
 * look directly — where OpenAI's gpt-image barely conditions on a second image and would rather
 * clone or ignore it. Dormant by default (needs REPLICATE_API_TOKEN); opt-in via
 * REFERENCE_RENDERER=replicate so the live OpenAI path (DNA-as-words) stays the default.
 */
export function styleTransferEnabled(): boolean {
  return !!process.env.REPLICATE_API_TOKEN && process.env.REFERENCE_RENDERER?.trim().toLowerCase() === "replicate";
}

/** Re-render a finished shot at 4K, faithfully — a high-res "upscale" for keepers. */
export async function upscaleShot(args: { id: string; src: string; aspect?: string }): Promise<string> {
  // The 4K re-render uses Gemini; available whenever its key is set (Replicate's
  // real upscaler is preferred upstream when REPLICATE_API_TOKEN is present).
  if (!process.env.GEMINI_API_KEY) return args.src;
  const prompt =
    "Reproduce this EXACT product photograph at maximum resolution. Keep it identical — same product, label, text, composition, colours, lighting, shadow and background — only increase resolution, sharpness and fine micro-detail. Do not restyle, recrop or change anything.";
  return renderGemini(args.id, prompt, [args.src], { aspect: args.aspect, imageSize: "4K" });
}

// Higgsfield adapter (spec default). Wire the real contract when the key + endpoint exist.
async function renderHiggsfield(_id: string, _prompt: string, _products: string[]): Promise<string> {
  throw new Error("Higgsfield renderer not configured — set HIGGSFIELD_API_KEY (+ HIGGSFIELD_ENDPOINT) to enable.");
}

function mockPlaceholder(id: string, label: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1280'><rect width='100%' height='100%' fill='#E8E5DF'/><text x='50%' y='50%' font-family='sans-serif' font-size='40' fill='#6E6E73' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const PRODUCT_LOCK =
  "ABSOLUTE RULE — ISOLATE THE PRODUCT, THEN REPRODUCE IT EXACTLY. The first attached image contains the product. LOOK ONLY AT THE PRODUCT OBJECT ITSELF. If that image also shows a hand, fingers, fingernails, other objects, props, text overlays, or a background, IGNORE ALL OF IT — do NOT reproduce the hand, fingers, nails, or the original background. Mentally cut the product out cleanly and reproduce ONLY the product with 100% fidelity: identical shape, silhouette, proportions, cap/closure, label, logo, typography, every word of text, colours and materials. Do NOT redraw, restyle, relabel, recolour, reshape, reinvent or 'improve' the product in ANY way. Then place that exact, isolated product into the NEW scene described below. The product must look pixel-faithful to the real product; everything around it (background, surface, props, lighting, angle) comes only from the brief.";

const REALISM_ANCHOR =
  "CAMERA-FIRST — describe HOW this was photographed, not how nice it looks. A REAL photograph on a full-frame body (Canon EOS R5 / Sony A7 IV) with a prime or macro lens, at the aperture the shot actually calls for — opened up (≈f/2–f/4) for a lifestyle or in-context frame so the background falls softly away, or stopped DOWN (≈f/8–f/16) for a packshot, flat-lay or detail shot so the WHOLE product stays sharp edge to edge and the surface reads flat and true; never a uniformly blurred, floaty background on a clean packshot or an overhead flat-lay. Kodak Portra 400 / Fujifilm colour — gentle highlight roll-off, fine organic grain, NO digital over-sharpening, NO HDR clarity. ONE motivated light source with a believable direction and a real, hard-edged-or-soft contact shadow; true material behaviour (glass refracts, metal speculars, matte stays matte). A specific, designed background/surface with real texture — never a flat generic void. Never a 3D, CGI, plastic, waxy or AI-render look.";

// The single deliberate flaw. AI images look fake because they are TOO clean — nothing a
// camera ever produced. One honest imperfection is what makes a creative director's eye
// believe a camera was there. Exactly ONE per frame — never a pile, never a spotless render.
const PRODUCT_IMPERFECTION =
  "ONE HONEST IMPERFECTION (mandatory — this is what sells the photograph as real): introduce EXACTLY ONE small, believable flaw consistent with a real capture, and nothing more. Pick ONE that suits the scene: a single faint blown-out highlight where the light catches hardest, one hard-edged natural shadow, a fine even film grain, the product placed very slightly off-centre or a touch off-axis, a faint dust speck, a soft fingerprint or smudge on glass, or a tiny reflection of the room. EXACTLY ONE — never several, never a dirty or damaged product, never a clinically perfect spotless frame. Do NOT alter the product itself; the flaw lives in the light, framing or surface, and NEVER throws the product or its text out of focus.";

// The clarity floor. The brand bar is literally "you can read every single thing", so the
// hero product and its text are ALWAYS pixel-crisp — the film look (grain, roll-off, shallow
// background) lives only AROUND the product, never on it. This is optical sharpness, not the
// banned digital over-sharpening / HDR clarity look.
const PRODUCT_LEGIBILITY =
  "TACK-SHARP, FULLY LEGIBLE PRODUCT (non-negotiable): the product itself — and every part of its label, printed text, logo, wordmark and fine print — must be perfectly in focus, crisp and completely readable, as if shot on a high-resolution full-frame sensor with the product on the plane of focus. Reproduce every word of the real text exactly and legibly; never blur, soften, smear, garble or throw the product or its text out of focus. Any shallow depth of field or soft focus applies ONLY to the background and surroundings, NEVER to the product or its text. Real optical clarity — NOT digital over-sharpening, edge halos or an HDR look.";

// Appetite appeal for FOOD & DRINK products (gated per-category by the caller, same seam as
// `wearable`). Freshness cues are physical camera facts, not marketer adjectives; the "physically
// true, never invent toppings" clause keeps it inside absolute product fidelity.
const FOOD_APPETITE =
  "APPETITE APPEAL (food & drink) — shoot the product at its most tempting, just-served moment. Render true, mouth-watering surface cues appropriate to what it actually is: a moist crumb, a molten or glossy centre, a crisp golden edge, fresh sheen, natural herbs or garnish exactly as the real product has them; for a cold drink, real condensation beading and slow drips down the glass, fresh ice, a natural foam or head; for anything hot, a faint wisp of real steam. Everything reads fresh and just-made — never dried out, congealed, waxy, plastic or like a stale food-styling prop. Enhance FRESHNESS only: keep every garnish, topping and texture PHYSICALLY TRUE to the real product; never invent ingredients or toppings it does not have.";

// Build the "restage the product into the reference's world" directive. Used when the
// client attaches a STYLE reference — they want THEIR product shot in THAT scene's look.
// The hard part: input_fidelity is high (to protect the product), which also makes the
// model cling to the product photo's ORIGINAL background. So we must explicitly command
// a full restage and split concerns cleanly: scene comes from the reference, identity
// (pattern/print/colourway/material) comes from the product, and the two never bleed.
function styleRestageBlock(which: string): string {
  return (
    `\n\nSTYLE REFERENCE — RESTAGE THE PRODUCT INTO THIS SCENE. ${which} a LOOK / SCENE reference, NOT the product and NOT a source of any product detail. ` +
    `Rebuild the WORLD of the reference from scratch and place the client's real product into it as the hero, so the result looks shot on the SAME set, by the SAME photographer, in the SAME style.\n` +
    `• TAKE FROM THE REFERENCE — the entire SET: the composition and how things are arranged and staged (how items are stacked, folded, propped, layered or laid out), the camera angle, distance and crop, the backdrop and surface, the UNRELATED props and their placement, the lighting quality and direction, the shadow behaviour, the colour grade and the overall mood — but NOT the reference's own hero item or the serving vessel that presents it.\n` +
    `• ERASE THE REFERENCE'S OWN HERO + ITS VESSEL — the reference's original product and any glass, cup, cone, bowl, plate, saucer, tray, stand, dish, jar or wrapper that exists only to present it are NOT props to reuse: remove them entirely, with no leftover remnant, silhouette, outline, shadow or reflection. The client's product brings its OWN presentation. The finished frame contains EXACTLY ONE product — the client's — never two, and never the client's product dropped into or replacing the contents of the reference's vessel.\n` +
    `• DISCARD FROM THE PRODUCT PHOTO — its original background, room, surface, props and arrangement ENTIRELY. None of the product photo's setting carries over. Keep ONLY the product object itself: its true material, weave, pattern, print, colourway, logo and every word of text, reproduced exactly.\n` +
    `• NEVER COPY FROM THE REFERENCE — its specific product(s), their colours, their pattern or print, their labels, text or branding. The product's own colours and print come ONLY from the first image and must NOT be recoloured, re-patterned or tinted to match the reference.\n` +
    `• SOFT / FORM-FLEXIBLE GOODS (bedding, sheets, textiles, apparel, towels, pouches, a garment): the product's identity is its FABRIC, PRINT, PATTERN, COLOURWAY and MATERIAL — not one fixed folded shape. You MAY re-form it (fold it, stack it, case it into pillows or cushions, drape or hang it) to occupy the reference's arrangement — this overrides any "keep the exact shape" instruction for such goods — but the print, pattern and colours must stay pixel-exact. A RIGID product (bottle, jar, tube, box, device) keeps its exact shape; only the camera and scene change.`
  );
}

// The signature AI tells that make a set look cheap and generated. Banned on every shot.
const ANTI_CLICHE_NEGATIVES = [
  "generic AI gradient-void background", "subject floating on a pedestal, podium or plinth",
  "concentric spotlight halo", "random scattered geometric cubes, spheres or pebbles",
  "fake confetti bokeh", "plastic CGI-render staging", "arbitrary swirling fabric backdrop",
  "default templated studio set with no concept",
];

// ── Model photoshoot anchors ──

// Camera-FIRST capture spec — leads every model prompt. Describing HOW the frame was
// photographed (hardware, aperture, film, motivated light, imperfections) is what
// breaks the plastic AI look, far more than describing the subject.
const CAPTURE_FIRST =
  "CAMERA-FIRST — describe HOW this was photographed before anything else. This is a REAL photograph, not a render or illustration. " +
  "Captured on professional full-frame mirrorless hardware: a Canon EOS R5 or Sony A7 IV with an 85mm f/1.4 portrait prime for beauty and three-quarter frames, a 35–50mm prime for full-length, or an iPhone 16 Pro for a candid lifestyle moment — shot wide open (around f/1.8–f/2.8) for a genuinely shallow depth of field, the subject tack-sharp while the background falls softly out of focus. " +
  "GRADED LIKE A PUNCHY MODERN EDITORIAL — vivid, bright and full of life, NOT a flat, muted, hazy or washed-out scan: rich deep blacks and a strong tonal range, clean luminous highlights that keep their detail, vibrant saturated true-to-life colour, and crisp micro-contrast so the image is bright, three-dimensional and pops off the screen. Keep fine organic film grain and genuinely REAL skin (visible pores, texture and subsurface warmth) — vivid means richly graded and contrasty, it does NOT mean plastic, waxy, over-smoothed, HDR-haloed, over-sharpened or orange/sunburnt. " +
  "Light is MOTIVATED, physical and PLENTIFUL — bright soft daylight through a big window, warm low golden-hour sun, or a strong soft directional key in a real room, well-exposed with confident contrast and shape; never flat, even, sourceless, murky or underexposed light. " +
  "Embrace natural imperfection, because real life is imperfect: a few flyaway hairs, visible skin pores and real skin texture, faint smile and expression lines, a relaxed unposed posture, a candid in-between-moments expression, and subtle natural asymmetry. The frame must read as one real shot from an editorial photoshoot a person actually took.";

const HUMAN_REALISM =
  "Render as REAL photography of a REAL human being, shot on a full-frame camera with a portrait prime lens. The person MUST pass as genuinely photographed: skin has visible pores, fine texture, peach fuzz and true subsurface scattering (never airbrushed, waxy or plastic); eyes are alive with real catchlights, correct iris and moisture; hands have exactly five natural fingers with believable grip; teeth vary naturally; hair has real strands, flyaways and a believable hairline; the face and body carry slight human asymmetry. One coherent light source falling believably on skin, shallow depth of field, true skin colour. Never a 3D, CGI, doll, plastic or AI-render look — the single fastest way to break the brand is a model who looks like AI.";

// The VIVID grade instruction — the prompt half of the "model shots look flat / AI" fix (the
// deterministic finishing pass is the pixel half). Steers gpt-image toward a bright, punchy,
// richly-graded editorial frame instead of the muted, hazy, low-contrast default. It is careful
// to define "vivid" as rich contrast + clarity + saturation, NOT the over-saturated, HDR-haloed,
// orange-skin look that is itself an AI tell — because over-cooked colour reads as fake, not real.
const VIVID_GRADE =
  "COLOUR & CONTRAST — VIVID, BRIGHT, EDITORIAL, ALIVE. Grade this like a punchy modern editorial cover, not a flat, muddy, hazy or washed-out capture: rich, deep, true blacks and a full tonal range; clean, luminous, well-exposed highlights that keep their detail; vibrant, saturated, true-to-life colour; and crisp micro-contrast so the frame is bright and reads three-dimensional and full of life, popping off the screen. " +
  "Keep the skin utterly REAL while doing it — pores, texture, subsurface warmth and every real mark stay intact. VIVID means richly graded, contrasty and saturated; it does NOT mean plastic, waxy, over-smoothed, HDR-haloed, blown-out or orange/sunburnt skin. A rich, confident, professionally-colour-graded photograph — never flat and never garish.";

// HUMAN MICRO-DETAIL — the feature-by-feature realism spec. gpt-image defaults to a smooth,
// evenly-lit "AI face"; these explicit per-feature cues force the skin-level detail that reads as a
// real photograph. Applied to EVERY model render (below), and mirrored in the model QC checklist so
// a smooth/waxy result is caught and reshot. This must survive the grade and any retouch.
const MICRO_REALISM =
  "HUMAN MICRO-DETAIL — resolve the face at true skin level so it reads as a real photograph, never a smooth render. Hold ALL of the following:\n" +
  "• SKIN — pores are distinctly visible and distributed evenly across the whole surface (never patchy or only in spots), with subtle natural variation in size and prominence — a little more open through the T-zone; fine vellus hair (peach fuzz) catches the light along the cheeks, jaw and upper lip; tiny natural bumps, a hint of natural oil/shine through the T-zone, and a fine skin grain; light GLANCES off the skin as a soft, DIRECTIONAL sheen with a believable falloff — never a flat, even, all-over glow; true subsurface warmth where the skin is thin.\n" +
  "• HAIR — individual strands are visible, not a molded solid mass or helmet; a few soft flyaways and slight frizz break the outline; highlights sit soft and organic, running along the strands with subtle light reflection; a natural, slightly irregular hairline.\n" +
  "• EYES — the iris shows a natural colour GRADIENT and fine radial fibres, never a flat solid disc; a live catchlight and real moisture on the eye; individual eyebrow hairs with small natural gaps; eyelashes are separated with a natural curl, never clumped, thick or drawn-on; where eye make-up is present its sheen reflects light realistically; fine lines and visible pores around the eyes.\n" +
  "• MOUTH / LIPS — a natural lip shape with real vertical texture and fine lines; subtle colour VARIATION across the lips, never one flat uniform tone; SOFT transitions where the lip meets the skin (no hard drawn outline); fine vellus or facial hair around the mouth as appropriate to the person; a realistic soft shadow in the philtrum and beneath the lower lip.\n" +
  "The single fastest tell of an AI face is smooth poreless skin, a flat even glow, molded strand-less hair, flat solid irises, clumped lashes and featureless one-tone lips — avoid every one of these.";

const MODEL_REF_LOCK =
  "IDENTITY LOCK — the FIRST attached image(s) are a LIKENESS REFERENCE of the MODEL: a real person the client wants in the shoot. Take ONLY the PERSON from it and reproduce THAT EXACT INDIVIDUAL, recognisably, in every frame — the goal is a precise match, not a lookalike or someone with the same vibe. " +
  "Match their specific facial geometry: face and head shape, eye shape, colour and spacing, brow shape, nose bridge and tip, lip shape and mouth width, jawline, chin, cheekbones, ears, hairline, hair colour/texture/length, skin tone and undertone, apparent age, body type, and any distinguishing marks (freckles, moles, scars, facial hair, glasses). Someone seeing the result must say it is unmistakably the same person. " +
  "PRESERVE EVERY REAL FLAW, EXACTLY AND VISIBLY — this is what makes it truly them and not a beautified stranger. Reproduce, and keep clearly visible, every imperfection present in the reference: any small cut, graze or healing scab, scar, stitches, bruise, blemish, spot or acne, mole, birthmark, freckles (in their real pattern and place), enlarged pores and real skin texture, fine lines and wrinkles, under-eye shadows or bags, tan lines, uneven skin tone or redness, stubble or stray facial hair, flyaway hairs, chipped or uneven nails, a gap or crooked or chipped tooth, and every natural asymmetry between the two sides of the face. If the reference shows a cut on the face, the render shows that SAME cut, in the same place, clearly. " +
  "Do NOT beautify, heal, clean up, smooth, even-out, retouch, cover, airbrush, slim, lighten, de-age, symmetrise, or swap them for a more conventional or attractive face — removing a real flaw changes who they are and is a failure. Only expression, pose, camera angle, lighting, wardrobe and hair styling may change; the identity, including every flaw, stays fixed and identical across the whole set. " +
  "CRITICAL — THIS IS NOT A PRODUCT REFERENCE: ignore ANYTHING the person is wearing, holding, applying or using in this image, and ignore any garment, logo, label, packaging, bottle, can or branding visible in it. NONE of that is the product, and none of it may appear in the result. The clothing, props and styling are yours to redesign for the brand. You may re-light, re-dress and re-stage the person freely — only the human likeness stays fixed and consistent across the set.";

/**
 * Identity lock for 3–4 DISTINCT people in one frame. Names which attached image indices
 * belong to which person so the model reproduces each one and never blends their faces.
 */
function multiPersonLock(people: { name?: string; refs: string[] }[]): string {
  let idx = 0;
  const lines = people.map((p, i) => {
    const start = idx + 1;
    const end = idx + p.refs.length;
    idx = end;
    const imgs = p.refs.length ? (start === end ? ` (image ${start})` : ` (images ${start}–${end})`) : "";
    const who = p.name?.trim() || `Person ${i + 1}`;
    return `• ${who}${imgs} — reproduce THAT exact individual: their facial geometry, skin tone, hair and body kept recognisably true, never beautified away.`;
  });
  return (
    `MULTIPLE DISTINCT PEOPLE — this frame contains ${people.length} DIFFERENT human beings, one identity per person. The first ${idx} attached image(s) are their likeness references, in this order:\n` +
    lines.join("\n") + "\n" +
    "Keep every person clearly DISTINCT and unmistakably themselves — NEVER blend, merge, average, duplicate, clone or swap their faces or bodies, and never collapse them toward one generic look. Each person appears EXACTLY ONCE. Compose them together as a believable group in one shot: natural spacing, real eyelines and interaction, consistent scale, one shared light and grade. Shoot stopped down enough (around f/4–f/5.6) that ALL of them sit inside the depth of field and every face reads tack-sharp — never the front person sharp with the rest melting into blur."
  );
}

/**
 * Group directive when the people are BUILT / described (no reference photos) — forces the
 * model to actually put N distinct people in the frame rather than defaulting to one model.
 */
function builtGroupLock(n: number): string {
  return (
    `GROUP OF PEOPLE — this frame shows EXACTLY ${n} DIFFERENT people together, a real group of ${n}. Cast ${n} distinct individuals, each with their OWN face, body, age, skin tone, hair and styling — a varied, diverse, natural group, never ${n} copies of the same person and never blended into one look. ALL ${n} of them are clearly visible together in EVERY frame, at consistent scale under one shared light, interacting naturally (real spacing, eyelines and body language). NEVER drop to a single person or a solo portrait — there must be ${n} people. Shoot stopped down enough (around f/4–f/5.6) that ALL of the people sit inside the depth of field and every face reads tack-sharp — never the front person sharp with the rest melting into blur.`
  );
}

const HUMAN_NEGATIVES = [
  "extra or missing fingers", "warped, fused or distorted hands", "deformed or duplicated limbs",
  "waxy, plastic, airbrushed or CGI skin", "over-smoothed, beauty-filtered or retouched-poreless skin",
  "poreless skin with a flat even all-over glow instead of a soft directional sheen",
  "over-sharpened HDR clarity look", "glossy Instagram-filter sheen", "flat, even, sourceless lighting",
  "dead, glassy or mismatched eyes", "flat solid-colour iris with no gradient or fibres", "clumped, thick or drawn-on eyelashes", "uniform tile-white teeth",
  "smooth featureless lips with no texture, no colour variation or a hard drawn outline",
  "molded helmet hair with no visible individual strands or flyaways", "helmet-like or unnatural hair", "uncanny perfect symmetry", "doll-like or mannequin face",
  "stiff over-posed catalogue posture", "3D render or video-game character look",
  "floating product", "warped or invented product label",
  "visible studio lighting equipment", "softbox, light panel, light stand or c-stand in frame",
  "reflector, umbrella, boom, tripod, cables or studio gear in frame", "visible crew or photographer",
  "any text, watermark, caption, logo overlay, UI button or border on the image",
];

const CLEAN_FRAME =
  "CLEAN FRAME — only the model (and the product, if any) are in shot. NO photographic equipment of any kind is visible anywhere in the frame: no softboxes, light panels, light stands, c-stands, reflectors, umbrellas, booms, tripods, cables, gels, monitors or studio gear, and no crew or photographer. " +
  "IMPORTANT: even if the lighting is described with words like 'softbox', 'studio light', 'lamp', 'window' or 'key light', those words describe ONLY the QUALITY and direction of the light — do NOT render any such light, fixture or equipment as a visible object in the frame. Show only the EFFECT of the light on the subject. " +
  "The background must be clean, even and seamless all the way to every edge. No text, watermark, caption, logo, UI element, button or border anywhere on the image.";

/**
 * CLEAN PLATE — for creatives whose copy is overlaid later as real typography (story / feed /
 * carousel / ad). The "render clean" rule used to live ONLY in the creative-type directive, which
 * is fed to the art-director PLANNER — the image model never saw it, so it happily embossed the
 * headline into the set and the overlay then printed the same words on top. Text over text.
 * This block puts the rule where it is actually enforced: the render prompt.
 */
const CLEAN_PLATE =
  "CLEAN PLATE — THIS PHOTOGRAPH IS A BACKGROUND. All headlines, sublines and CTAs are overlaid afterwards in real fonts, so the render itself must contain ZERO added text. " +
  "Do NOT write, letter, emboss, deboss, engrave, carve, paint, print, stencil, stamp, arrange or spell out ANY word, headline, tagline, slogan, caption, sign, label, sticker, badge or watermark anywhere in the scene — not on the backdrop, surface, wall, table, packaging tissue, ribbon or any prop, and not formed out of petals, powder, cream or any material. " +
  "The ONLY text permitted anywhere in the entire frame is the text physically printed on the product itself, reproduced exactly as it really is. " +
  "The reserved negative space must be left GENUINELY EMPTY — empty is correct, not an unfinished look to decorate with type. " +
  "COMPOSE FOR THE OVERLAY: deliberately weight the product and all staging into one side or one third of the frame, leaving a generous, uncluttered, evenly-lit expanse of plain background — clean of props, busy texture and important detail — where the headline and CTA will later be set in real type. Treat that empty band as a designed part of the shot, sized for a few lines of large type, and keep the product well clear of it so overlaid copy never touches the product.";

/** Text the model must never invent into the frame. Scoped so the PRODUCT's own printed text
 *  (required by PRODUCT_LOCK) stays mandatory — only ADDED scene text is banned. */
const ADDED_TEXT_NEGATIVES = [
  "any headline, tagline, slogan, caption, title or marketing copy rendered into the scene",
  "text, lettering, typography or handwriting on the background, surface, wall or any prop",
  "words embossed, debossed, engraved, carved, painted or spelled out in any material on the set",
  "any watermark, caption bar, logo overlay, UI element, button, badge, sticker or border on the image",
];

const WARDROBE_REALISM =
  "WARDROBE REALISM — IF THE PRODUCT IS APPAREL / CLOTHING: the model wears that exact garment in its ANATOMICALLY CORRECT position — trousers and jeans sit at the natural waist/hips and cover the legs down to the ankles; a top covers the torso; a dress hangs full-length; outerwear layers over. Tailor the garment to fit the model's real body and pose with believable drape, fold and fabric behaviour. Dress the model in a COMPLETE, realistic, brand-appropriate outfit — style suitable complementary pieces around the product (for jeans, pair a simple fitted top; for a top, pair suitable bottoms) so the person is fully and properly dressed, with the product as the clear hero. NEVER stretch one garment over the entire body, NEVER pull a bottom garment up as a strapless wrap, NEVER place a garment in the wrong position, NEVER paste it on as a flat cut-out, and NEVER leave the model partially, oddly or impossibly dressed.";

/**
 * Render one model-photoshoot frame. The model can be a pasted reference (identity
 * locked from the first images) or built from attributes (described in the prompt).
 * The product, if any, is locked exactly as in product mode and placed on the model.
 */
export async function renderModelShot(args: {
  id: string;
  prompt: string;
  negatives?: string[];
  extraNegatives?: string[]; // stored compliance do-not, re-injected on every (re)render
  modelRefs?: string[]; // reference photo(s) of the person to reproduce (first in the stack)
  modelManifest?: string; // forensic likeness + FLAW manifest of the reference person (from analyzeModelRef) — every mark must be reproduced, visibly, never beautified away
  people?: { name?: string; refs: string[] }[]; // 3–4 DISTINCT people (≥2) WITH reference photos — builds a per-person identity lock
  groupCount?: number; // 3–4 DISTINCT people from BUILT/described casting (no photos) — forces N people in frame
  products?: string[]; // optional product to place on the model
  productIdentity?: string; // what the product actually IS — locks on-model reproduction to the real item
  productManifest?: string; // every element on the pack — all camera-facing ones must appear, legibly
  category?: ProductCategory; // the product's object class — clothing stays clothing, never a bottle/cup/…
  references?: string[]; // optional style/look references
  referencesAreBrand?: boolean; // true when references are the brand's OWN published photos
  refScene?: string; // words describing a SCENE reference (from describeReferenceScene) — rebuild its SET, keep the person + product (legacy literal-restage)
  refDNA?: ReferenceDNA; // the client reference's reusable campaign VIBE — applied as a per-frame style layer while each frame keeps its own composition
  brandLook?: string; // how this brand shoots (from describeBrandLook) — applies their photographic signature (set/light/grade/styling) to the on-model frame; never copies their product/face
  wearable?: boolean; // false → the product is NOT clothing (food/drink/furniture/object): suppress wardrobe prose, ban "worn"
  aspect?: string;
  imageSize?: string;
  inputFidelity?: "high" | "low"; // caller override (e.g. a QC reshoot escalating to "high" to fix likeness/product drift); wins over the internal default
  finish?: FinishGrade; // brand grade for the deterministic finishing pass (defaults to NEUTRAL_GRADE)
}): Promise<string> {
  // Multi-person: 2+ DISTINCT people, each with their own reference photo(s). Their refs are
  // flattened into modelRefs (person order preserved) so the identity lock can address images
  // by index. A single person still flows through the plain modelRefs path below, unchanged.
  const people = (args.people ?? []).map((p) => ({ name: p.name, refs: (p.refs ?? []).filter(Boolean) })).filter((p) => p.refs.length);
  const multiPerson = people.length >= 2;
  // groupCount covers BOTH paths: reference groups (people with photos) and built/described
  // groups (no photos, just a count). ≥2 → the frame must contain that many distinct people.
  const groupCount = multiPerson ? people.length : Math.max(0, Math.min(4, args.groupCount ?? 0));
  const modelRefs = multiPerson ? people.flatMap((p) => p.refs) : (args.modelRefs ?? []).filter(Boolean);
  const products = (args.products ?? []).filter(Boolean);
  const references = (args.references ?? []).filter(Boolean);
  const negatives = [...(args.negatives ?? []), ...(args.extraNegatives ?? []), ...HUMAN_NEGATIVES, ...ANTI_CLICHE_NEGATIVES];
  if (modelRefs.length && products.length) negatives.push("copying the product, garment, packaging, logo or branding from the model/likeness image", "featuring any product other than the one in the product image");
  if (groupCount >= 2) negatives.push("blending, merging, averaging, duplicating, cloning or swapping the different people's faces or bodies", `showing fewer or more than ${groupCount} people`, "only one person or a single model instead of the full group", "one person repeated to look like several");
  if (products.length && args.wearable !== false) negatives.push("garment stretched over the whole body", "a bottom garment pulled up as a strapless wrap", "clothing worn in the wrong anatomical position", "a flat cut-out garment pasted onto the body", "model left partially, oddly or impossibly dressed", "distorted or unrealistic garment fit");
  // A non-wearable (food, drink, furniture, an object) must NEVER be worn — the "you cannot wear an ice cream" rule at the pixel level.
  if (products.length && args.wearable === false) negatives.push("the model wearing, draping, putting on or dressing in the product as if it were clothing", "the product stretched, worn or wrapped over the body", "treating a non-clothing product (food, drink, furniture, an object) as a garment or outfit");
  // Object-class lock — the on-model product can never drift into a different KIND of object.
  if (products.length && args.category) negatives.push(...categoryNegatives(args.category));

  const blocks: string[] = [];
  blocks.push(CAPTURE_FIRST); // lead camera-first — this is what kills the AI look
  if (multiPerson) blocks.push(multiPersonLock(people));
  else if (groupCount >= 2) blocks.push(builtGroupLock(groupCount));
  else if (modelRefs.length) {
    blocks.push(MODEL_REF_LOCK);
    // The forensic likeness + FLAW manifest read off the reference (analyzeModelRef). gpt-image
    // at high fidelity still tends to quietly smooth and beautify — this is the belt-and-braces
    // that forces every real cut / scar / blemish / asymmetry to survive, exactly as the product
    // manifest forces every printed element to survive. Only present when we have ONE reference.
    if (args.modelManifest) blocks.push(
      `EXACT LIKENESS — THIS PERSON'S REAL FEATURES & FLAWS (read from the reference). Reproduce EVERY one of these faithfully and keep it clearly VISIBLE in the render; do NOT heal, smooth, clean up, retouch, even-out, cover, airbrush or beautify ANY of them — a flaw in the reference is a flaw in the result, in the same place:\n${args.modelManifest}`
    );
  }
  if (products.length) {
    const ordinal = modelRefs.length ? "NEXT" : "FIRST";
    const onlySource = modelRefs.length
      ? " THE PRODUCT TO FEATURE COMES ONLY FROM THIS PRODUCT IMAGE — never from the model/likeness image above. Whatever the model was wearing or holding in their reference is irrelevant; replace it with THIS product."
      : "";
    blocks.push(
      `PRODUCT LOCK — the ${ordinal} attached image(s) show the client's REAL product.${onlySource} Study it closely and reproduce it with 100% fidelity: exact shape, silhouette, proportions, cut, cap/closure, materials, fabric, wash/colour, seams, stitching, hardware, label, logo, every word of text — sample the real colours and design, do not approximate or restyle. ` +
      `IF THE PRODUCT IS CLOTHING / APPAREL, IT IS THE WARDROBE: the model wears THIS EXACT garment, reproduced faithfully and kept IDENTICAL in every frame of the set — same cut, fit, wash, colour, seams, pockets, hardware and labels. Do NOT design a different garment, restyle it, recolour it, or swap it between frames; you may only add complementary layers/accessories that never hide or alter it. ` +
      `Place the product on the model at its TRUE real-world scale, with real contact, occlusion where fingers or body cover it, and a real contact shadow. Ignore any hand, prop or background in that image — reproduce only the product object. Never restyle, relabel, recolour or reinvent it.`
    );
    // Same identity / class / manifest anchors the PRODUCT path uses, so on-model reproduction is
    // as faithful as a packshot — the model path previously got none of these.
    if (args.productIdentity) blocks.push(`THIS PRODUCT — the ONE real item to reproduce on the model is: ${args.productIdentity}. Render THIS exact product; never substitute, swap in or invent a different product, variant, flavour, size, shape or design.`);
    if (args.category) blocks.push(categoryLock(args.category));
    if (args.productManifest) blocks.push(`EVERYTHING ON THE PRODUCT — the real product carries these exact elements, and EVERY one that faces the camera must appear, complete and legible; do NOT omit, shorten, translate, garble or invent any of them:\n${args.productManifest}`);
  }
  // SCENE reference (a look to recreate around the model) rebuilds the reference's SET but keeps the
  // person + product — distinct from a STYLE reference (mood only) and from the person likeness ref.
  if (args.refScene) {
    blocks.push(
      `SCENE REFERENCE — rebuild the SET from the attached reference, but KEEP the model and place the client's product on/with them. Recreate ONLY the reference's environment: composition and crop, camera angle and distance, background, surface, staging props, lighting direction and quality, shadows, colour grade and mood. Remove any person or hero product that appears in the reference — the model (from the likeness reference) is the sole human subject and carries the client's product. Reference scene:\n${args.refScene}\n\n(The brand's general scene direction below is SECONDARY and must never override the reference's set, composition or lighting: ${args.prompt})`
    );
  } else {
    blocks.push(args.prompt);
  }
  if (products.length && args.wearable !== false) blocks.push(WARDROBE_REALISM);
  if (products.length) blocks.push(PRODUCT_LEGIBILITY);
  blocks.push(`Avoid: ${negatives.join(", ")}.`);
  blocks.push(HUMAN_REALISM);
  blocks.push(MICRO_REALISM);
  blocks.push(VIVID_GRADE);
  blocks.push(CLEAN_FRAME);
  if (references.length && !(args.refScene && !args.referencesAreBrand)) {
    blocks.push(
      args.referencesAreBrand
        ? `BRAND LOOK — the LAST attached image(s) are this brand's OWN published photography (their real website / feed). Match their visual signature so this frame belongs in THAT feed: wardrobe register and styling, set and palette, colour grade, lighting quality and direction, mood and crop. Do NOT copy any person, face or product from them — only the art-direction and taste.`
        : `STYLE REFERENCE — the LAST attached image(s) are a LOOK reference only (wardrobe register, set, palette, lighting, mood). Match that art direction, but do NOT copy any person, face or product from it.`
    );
  }
  // Campaign-vibe style layer: colour the whole frame with the reference's photoshoot signature
  // while keeping the model, product and this frame's own composition. Rides last, above the scene.
  if (args.refDNA && !args.referencesAreBrand) blocks.push(referenceDNABlock(args.refDNA, true));
  // BRAND PHOTOGRAPHIC WORLD (from describeBrandLook, read off the brand's OWN feed) — the fix for
  // "the brand's look never reaches MODEL pixels". Apply their real photographic signature (set,
  // surfaces, light quality & direction, colour grade, palette, styling / prop density, crop) so an
  // on-model frame belongs in this brand's feed — WITHOUT copying any product, face or text from
  // their photos (person comes from the likeness ref, product from the product image).
  if (args.brandLook) blocks.push(
    `BRAND PHOTOGRAPHIC WORLD — reproduce THIS brand's photographic signature so the shot belongs in their real feed: their backgrounds and surfaces, light quality and direction, colour grade and palette, styling / wardrobe register, prop density, camera feel and crop. Do NOT copy any product, face, person or text from the brand's photos — only their art-direction and taste; the person comes from the likeness reference and the product from the product image:\n${args.brandLook}`
  );
  const fullPrompt = blocks.join("\n\n");

  // Order: model identity first, then product, then style references.
  const refs = [...modelRefs, ...products, ...references];
  // Model frames are inherently multi-subject (person + product/refs) — keep them on
  // the proven multi-image renderer, not the single-image Replicate editor.
  // Force input_fidelity HIGH when a likeness reference is in play so the OpenAI/Azure
  // edit path holds the EXACT face true — never let a global speed setting soften it.
  const inputFidelity = args.inputFidelity ?? (modelRefs.length ? "high" : undefined);
  // VIVID, skin-safe grade: NEUTRAL per-channel cast (the brand hue can never tint the model's
  // skin) but a real editorial lift in contrast, vibrance, exposure and local-contrast clarity —
  // the fix for the flat, muted, "AI-generated" model look. Env-tunable via MODEL_VIVID_INTENSITY.
  return dispatch(args.id, fullPrompt, refs, { aspect: args.aspect, imageSize: args.imageSize, multiSubject: true, inputFidelity, finish: editorialModelGrade(args.finish) });
}

// Maps an angle label to the ONE viewpoint instruction that applies. Feeding gpt-image a single
// clear viewpoint (instead of a seven-item contradictory menu) is the biggest lever on the #1
// product-set complaint — every planned "angle" coming back as the same front view.
const ANGLE_GUIDE: { test: RegExp; line: string }[] = [
  { test: /three-quarter|45/i, line: "THREE-QUARTER / 45° — turn the product ~45° so TWO faces are visible at once and the front label wraps toward the receding edge; clearly not face-on." },
  { test: /top-down|flat.?lay|overhead/i, line: "TOP-DOWN / OVERHEAD / FLAT-LAY — lay the product FLAT on the surface and shoot from DIRECTLY ABOVE looking straight down; it must read as a bird's-eye flat-lay, NEVER a standing product." },
  { test: /\bside\b|profile/i, line: "SIDE / PROFILE — the narrow side edge toward camera, showing the product's depth/thickness, the label seen edge-on." },
  { test: /low angle|looking up/i, line: "LOW ANGLE — camera near the surface looking UP so the product looms tall against the space above it." },
  { test: /high angle|looking down/i, line: "HIGH ANGLE — camera raised, looking down onto the product at roughly 45°." },
  { test: /\bback\b|\brear\b|base|underside|bottom/i, line: "BACK / BASE — rotate to show the rear or the underside." },
  { test: /macro|detail/i, line: "MACRO / DETAIL — fill the frame with ONE region (cap, label, texture) at very close distance." },
];

export async function renderShot(args: {
  id: string;
  prompt: string;
  angle?: string; // the specific camera angle this shot must be taken from
  negatives?: string[];
  extraNegatives?: string[]; // stored compliance do-not, re-injected on every (re)render
  products: string[];
  references?: string[]; // style/look references to emulate (NOT the product)
  referencesAreBrand?: boolean; // true when references are the brand's OWN published photos
  refScene?: string; // words describing the reference's scene (from describeReferenceScene) — the authoritative look to recreate on the OpenAI path (legacy literal-restage)
  refDNA?: ReferenceDNA; // the client reference's reusable campaign VIBE (from describeReferenceCampaign) — applied as a per-shot style layer while each frame keeps its own composition
  productIdentity?: string; // what the product actually IS — locks against rendering a different product/variant
  productManifest?: string; // every element on the pack (from analyzeProduct) — all must appear, legibly
  category?: ProductCategory; // the product's object class — locks it (clothing stays clothing, never a bottle/cup/…)
  brandLook?: string; // how this brand shoots, read off their real feed at gen time (from describeBrandLook)
  noProduct?: boolean; // no product supplied → render an on-brand scene, never an invented hero product
  cleanPlate?: boolean; // copy is overlaid later → the render must carry NO text of its own
  appetite?: boolean; // food/drink product → inject the appetite-appeal freshness directive
  aspect?: string;
  imageSize?: string;
  inputFidelity?: "high" | "low"; // caller override (e.g. a QC reshoot escalating to "high" to fix product drift); wins over the internal restage/rotation/profile default
  finish?: FinishGrade; // brand grade for the deterministic finishing pass (defaults to NEUTRAL_GRADE)
}): Promise<string> {
  const products = (args.products ?? []).filter(Boolean);
  const references = (args.references ?? []).filter(Boolean);
  // Brand-look references (the brand's OWN feed photos, used to match how they shoot) behave
  // very differently from a client RESTAGE reference: they must NOT trigger the "erase the
  // reference's hero + vessel" restage rules, must NOT demote the planner's scene, and must NOT
  // drop the product to low fidelity — the product stays pixel-true; only the look is borrowed.
  const brandRefs = !!args.referencesAreBrand;
  // CAMPAIGN-VIBE path (the reference fix): a client reference is present as reusable DNA. Its
  // light/grade/mood/set/styling ride as a per-shot STYLE LAYER on top of the planned, VARIED
  // composition — never a single cloned scene. This supersedes the legacy literal-restage below,
  // so a reference never again demotes the plan or forces every frame to the same viewpoint.
  const dnaCampaign = !!args.refDNA && !brandRefs;
  // Legacy literal-restage — only when there is NO DNA (kept for compatibility): rebuild the ONE
  // reference scene and swap the product in. The route no longer routes here by default.
  const clientRestage = !dnaCampaign && references.length > 0 && !brandRefs;
  // How this brand actually shoots, read off their real feed at generation time — applied to the
  // render directly (the researched rulebook only ever reached the planner as prose before).
  const brandLookBlock = args.brandLook
    ? clientRestage
      // A client reference is driving composition/set/light — so the brand look rides ALONGSIDE it
      // as the GRADE/PALETTE/STYLING layer only, never overriding the reference's framing. This is
      // what makes "my product in this reference, in MY brand style" true instead of a bare restage.
      ? `\n\nBRAND STYLE LAYER (applied ON TOP of the reference scene) — give the shot THIS brand's colour grade, palette, styling / wardrobe register, prop density and finishing feel so it unmistakably reads as this brand's work. But do NOT let it change the reference's composition, camera angle, set, surface or lighting DIRECTION — the reference owns those. Rule when they disagree: brand wins on GRADE, PALETTE and STYLING; the reference wins on COMPOSITION, SET and CAMERA. Do NOT copy any product, label or text from the brand's photos:\n${args.brandLook}`
      : `\n\nBRAND PHOTOGRAPHIC WORLD — the finished shot must look like it belongs in this brand's real feed. Reproduce THIS brand's photographic signature (backgrounds, surfaces, light quality & direction, colour grade, palette, styling/prop density, camera feel and crop), but do NOT copy any product, label or text from it — the product comes only from the attached product image(s). Where this brand's real signature differs from the generic film/camera recipe elsewhere in this brief — its grade, contrast, warmth, hardness of light or depth of field — THIS brand's actual look WINS; match what they really shoot, not the default:\n${args.brandLook}`
    : "";
  // NO-HERO-PRODUCT branch — the client gave no product, so we NEVER invent one. Produce an
  // on-brand atmospheric scene from the brand world + look, with product-lock rules omitted.
  if (args.noProduct) {
    const npNeg = [...(args.negatives ?? []), ...(args.extraNegatives ?? []), ...ANTI_CLICHE_NEGATIVES,
      "inventing, fabricating or depicting any specific product, package, bottle, jar, tube, box, can, pouch, label or logo as a hero",
      "any garbled, gibberish, warped or fake lettering or text anywhere in frame",
      "any person, model or human in frame", "a hand, fingers, arm, leg, foot or any body part in frame",
      "any text, watermark, caption, logo overlay, UI element or border on the image"];
    const np =
      `BRAND-WORLD SCENE — NO HERO PRODUCT. The client has NOT provided a product for this shot, so DO NOT invent, fabricate or depict any specific product, package, bottle or logo as a hero. Instead create an on-brand, atmospheric photograph that captures THIS brand's world — its surfaces, environment, light, palette, textures and mood — the kind of contextual / still-life frame a brand runs between product shots.\n\n${args.prompt}` +
      `\n\nAvoid: ${npNeg.join(", ")}.` +
      `\n\n${REALISM_ANCHOR}` +
      `${brandLookBlock}`;
    // Deliberately NO reference images: an edit-from-image would clone the brand photo (and its
    // product). The brand look rides as WORDS so the scene is fresh and product-free.
    return dispatch(args.id, np, [], { aspect: args.aspect, imageSize: args.imageSize, multiSubject: false, finish: args.finish });
  }
  // The product's identity + full on-pack manifest — the two levers that stop the model rendering
  // a DIFFERENT product and stop it dropping any of the product's real text/marks.
  const identityBlock = args.productIdentity
    ? `\n\nTHIS PRODUCT — the ONE real item to reproduce is: ${args.productIdentity}. Render THIS exact product; never substitute, swap in or invent a different product, variant, flavour, size, shape or design.`
    : "";
  const manifestBlock = args.productManifest
    ? `\n\nEVERYTHING ON THE PRODUCT — the real product carries these exact elements, and EVERY one that faces the camera in this shot must appear, complete, unbroken and fully legible; do NOT omit, drop, shorten, merge, translate, re-order or invent any of them:\n${args.productManifest}`
    : "";
  // Object-class lock — clothing stays clothing, a bottle stays a bottle. Holds even in restage /
  // low-fidelity mode (the reference can never turn the product into a different kind of object).
  const categoryBlock = args.category ? `\n\n${categoryLock(args.category)}` : "";
  // With a STYLE reference the product may be legitimately RE-FORMED to fit the reference's
  // arrangement (a duvet cased into pillows, a garment folded/stacked) — so the identity to
  // protect is its colour/pattern/print/text, NOT its folded shape (rigid-shape protection
  // stays in PRODUCT_LOCK + the restage block). Without a reference, shape stays locked too.
  const identityNegative = clientRestage
    ? "changing the product's colour, pattern, print or text"
    : "changing the product's shape, colour or text";
  const negatives = [...(args.negatives ?? []), ...(args.extraNegatives ?? []), ...ANTI_CLICHE_NEGATIVES, "altering, redrawing, restyling or relabelling the product", identityNegative, "inventing a different product",
    ...(args.category ? categoryNegatives(args.category) : []),
    // Fidelity tell seen on the fast/low-fidelity path: it hallucinates a woven brand label
    // or tag with garbled lettering that isn't on the real product. Ban invented/fake text;
    // PRODUCT_LOCK already requires reproducing any REAL text exactly.
    "inventing a brand label, woven tag, hangtag or care label the real product does not have", "garbled, gibberish, warped or fake lettering or text anywhere on the product",
    // Product photoshoot = product-only. Humans belong in the model shoot.
    "any person, model or human in frame", "a hand, fingers, arm, leg, foot or any body part in frame", "the product being held, worn, touched or carried by a person",
    // A product shoot never wants INVENTED scene text — and when copy is overlaid later, baked-in
    // text collides with the real typography (the "two headlines" bug). The product's OWN printed
    // text is unaffected: PRODUCT_LOCK still requires reproducing it exactly.
    ...ADDED_TEXT_NEGATIVES];
  // With a CLIENT restage reference, the original hero + its serving vessel must be gone and
  // exactly ONE product (the client's) may remain — the "remove the ice cream AND the glass"
  // rule. Brand-look references depict the brand's OWN world, so this erase rule does not apply.
  if (clientRestage) negatives.push(
    "keeping the reference photo's original hero item, or its glass, cup, cone, bowl, plate, saucer, tray, stand, jar or wrapper, anywhere in frame",
    "showing two products at once",
    "placing the client's product inside or replacing the contents of the reference's vessel",
    "any leftover remnant, silhouette, outline, shadow or reflection of the reference's original hero or its vessel",
  );
  // Campaign-vibe path: borrow the reference's LOOK, never its subject — so its own product,
  // colours or text can never bleed onto the client's product.
  if (dnaCampaign) negatives.push(
    "copying the reference's own product, its shape, label, wording, logo or branding",
    "recolouring or re-tinting the client's product to match the reference's product colours",
    "showing the reference's hero item or a second product anywhere in frame",
  );
  // Camera angle is enforced HERE, not just in the art-director prose: in edit mode the
  // model anchors to the reference photo's framing, so we explicitly move the camera and
  // permit re-orienting the product (identity fixed) to hit genuinely distinct viewpoints.
  // BUT when a STYLE reference is driving the shot, ITS composition is the whole point —
  // forcing a different angle would fight the look the client asked us to reproduce, so the
  // angle lock stands down and the reference scene (below) governs framing.
  const matchedAngle = args.angle ? ANGLE_GUIDE.find((a) => a.test.test(args.angle!)) : undefined;
  const angleLock = args.angle && !args.refScene
    ? `\n\nCAMERA ANGLE — MANDATORY, NON-NEGOTIABLE: this shot MUST be photographed from a genuinely DIFFERENT viewpoint — ${args.angle}. Do NOT reproduce the uploaded photo's upright straight-on framing; the product's ON-SCREEN SILHOUETTE must visibly CHANGE from a plain front view. Physically move the camera AND re-orient the product to present THIS ONE viewpoint:\n` +
      `• ${matchedAngle ? matchedAngle.line : args.angle}\n` +
      `Only the CAMERA and the product's ORIENTATION change — its identity, exact shape, label text, colours and material stay 100% fixed (the product-lock rules above still govern identity). The result must be UNMISTAKABLY this angle — not the same front shot with a different background, shadow or crop.`
    : "";
  // When a STYLE reference drives the shoot, the reference's WORLD must win. The planner
  // never saw the reference image, so its invented scene (args.prompt) describes the BRAND
  // world — left at full strength it fights the restage block below and usually overrides
  // the look the client explicitly asked us to match. So demote it to mood/taste only and
  // make the reference authoritative on composition, background, palette, staging and crop.
  const scene = args.refScene
    ? `SCENE — REBUILD THE REFERENCE'S SET, THEN SWAP IN THE CLIENT'S PRODUCT. The client attached a reference photo they want matched; below is its precise description. Do this in order: (1) REMOVE the reference's OWN hero item AND any vessel, holder or plating that exists only to present it — its glass, cup, cone, bowl, plate, saucer, tray, stand, dish, jar or wrapper — completely: no remnant, silhouette, outline, shadow or reflection of it may survive. (2) Faithfully REBUILD only the SET — the same composition and crop, camera angle, background, surface, unrelated props and staging, lighting direction and quality, shadows, colour grade and mood. (3) PLACE the client's product (from the first image) as the SOLE hero in the vacated spot, at a believable scale with real contact and shadow, using its OWN appropriate presentation — never dropped into or replacing the contents of the reference's vessel, never sitting beside the original. EXACTLY ONE product ends up in the frame: the client's.\n${args.refScene}\n\n(The brand's general taste is STRICTLY SECONDARY and must never override the reference scene above: ${args.prompt})`
    : clientRestage
    ? `MOOD / TASTE ONLY (SECONDARY) — the following is the brand's general taste, NOT the scene to build. Where it conflicts with the STYLE REFERENCE described below, the REFERENCE WINS: do NOT let it override the reference's composition, background, surface, palette, arrangement, lighting or crop.\n${args.prompt}`
    : args.prompt;
  let fullPrompt =
    `${PRODUCT_LOCK}${identityBlock}${categoryBlock}${angleLock}\n\n${scene}` +
    `\n\nAvoid: ${negatives.join(", ")}.` +
    (args.cleanPlate ? `\n\n${CLEAN_PLATE}` : "") +
    `\n\n${REALISM_ANCHOR}` +
    `\n\n${PRODUCT_IMPERFECTION}` +
    `\n\n${PRODUCT_LEGIBILITY}${args.appetite ? "\n\n" + FOOD_APPETITE : ""}${manifestBlock}${brandLookBlock}` +
    // The campaign-vibe style layer rides LAST so it colours everything above without demoting
    // the planned, per-shot composition (which the angle lock still governs).
    (dnaCampaign ? referenceDNABlock(args.refDNA!, false) : "");
  if (references.length) {
    const which = references.length === 1 ? "the LAST attached image is" : `the LAST ${references.length} attached images are`;
    fullPrompt += args.referencesAreBrand
      ? `\n\nBRAND LOOK — ${which} this brand's OWN published photography, pulled from their real website / feed. This is the visual signature the result MUST belong to: study and match their background and palette, surface and set, prop / styling density, colour grade, lighting quality and direction, depth of field, mood and crop. The new shot should look like it could sit in THIS brand's actual feed next to these — same photographic world, same taste. Do NOT copy the product, label, text or branding from these images; the product comes only from the first image(s) and the scene from the brief.`
      : dnaCampaign
      // Campaign-vibe with the reference image attached (open-source style-transfer path): treat it
      // as a pure LOOK reference — match its light/grade/mood/palette, keep THIS shot's own
      // composition, and never copy its product or subject.
      ? `\n\nSTYLE REFERENCE (LOOK ONLY) — ${which} the client's campaign reference. Match ONLY its photographic look — light, colour grade, palette, contrast, mood, styling density and finish — and let it colour this frame. Do NOT copy its hero product, subject, composition or crop; this shot keeps its own composition from the brief, and the product comes only from the first image(s), reproduced exactly.`
      : styleRestageBlock(which);
  }
  // Product image(s) first (the subject), style references last (the look).
  const refs = [...products, ...references];
  // Single product, no extra refs → fast single-image Replicate path is safe. Multiple
  // products or style refs need compositing, so route those to a multi-image renderer.
  const multiSubject = products.length + references.length > 1;
  // RESTAGE (a style reference is present): gpt-image-1-mini barely conditions on a second
  // reference image — it follows the brand-world text and ignores the reference, so "match
  // the reference" quietly fails. Gemini's image model genuinely restages from a second
  // image and is the right home for these shots. But this must be OPT-IN: it only helps
  // with a WORKING Gemini key, and routing to a dead key would turn a wrong shot into a
  // hard error. Enable with RESTAGE_RENDERER=gemini once GEMINI_API_KEY is valid.
  const preferGemini =
    clientRestage &&
    process.env.RESTAGE_RENDERER?.trim().toLowerCase() === "gemini" &&
    !!process.env.GEMINI_API_KEY;
  // OPEN-SOURCE reference path: when the campaign-vibe reference is present and the open model is
  // opted in (REFERENCE_RENDERER=replicate + REPLICATE_API_TOKEN), render the product on the
  // open-source model with the campaign vibe carried as words. Dormant otherwise — the live
  // OpenAI path (DNA-as-words) stays the default, so nothing changes without the token + flag.
  const preferReplicate = dnaCampaign && styleTransferEnabled();
  // CAMERA VARIETY vs fidelity: at input_fidelity="high" gpt-image CLONES the uploaded
  // photo's exact framing, so every planned "angle" comes back as the same front view —
  // the #1 complaint about product sets. A genuine new VIEWPOINT (three-quarter, overhead,
  // side, low/high, back, base) requires the model to re-orient the product and invent
  // unseen faces, which high fidelity forbids. So rotation angles drop to LOW fidelity to
  // free the camera; the straight-on hero and macro/detail crops (same viewpoint) keep HIGH
  // so identity stays pixel-true. PRODUCT_LOCK still holds colour/label/material throughout.
  const rotationAngle = !!args.angle && /three-quarter|45\s*°|45°|\b45\b|top-down|flat.?lay|overhead|\bside\b|profile|low angle|looking up|high angle|looking down|\bback\b|\brear\b|bottom|\bbase\b|underside/i.test(args.angle);
  // On the OpenAI path, a restage also needs LOW input_fidelity so the model stops cloning
  // the product photo's own background and rebuilds the reference's scene. Both env-tunable.
  // ORDER MATTERS: a restage or rotation/flat-lay shot MUST stay LOW even when the caller passes a
  // "high" override — a QC-reshoot escalation forcing high would re-clone the product photo's own
  // framing and SNAP THE CAMERA BACK to the front view, defeating the whole point of the angle. So
  // restage/rotation win; only a PLAIN hero/macro/brand-look shot honours args.inputFidelity, then
  // falls to the RENDER_SPEED profile (balanced/fast → "low", quality → "high").
  const inputFidelity =
    clientRestage ? (process.env.OPENAI_RESTAGE_FIDELITY || "low")
    : rotationAngle ? (process.env.OPENAI_ANGLE_FIDELITY || "low")
    : (args.inputFidelity ?? undefined);
  return dispatch(args.id, fullPrompt, refs, { aspect: args.aspect, imageSize: args.imageSize, multiSubject, preferGemini, preferReplicate, inputFidelity, finish: args.finish });
}

// ── OpenRouter renderer (NEW — additive; existing renderers are untouched) ──
// OpenRouter does NOT serve OpenAI's /images/edits endpoint (404), so product-fidelity
// editing runs through the CHAT-COMPLETIONS image path instead: the prompt + the product /
// reference images go in as multimodal content, `modalities:["image","text"]` asks for an
// image back, and the model returns it inline as a data URL. Key + model are env-ONLY
// (OPENROUTER_API_KEY / OPENROUTER_IMAGE_MODEL) so swapping either is a pure .env change —
// nothing in code moves, and reverting to the original OpenAI path is just IMAGE_PROVIDER.
async function renderOpenRouter(id: string, prompt: string, refs: string[], opts: { aspect?: string; inputFidelity?: string }): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const model = process.env.OPENROUTER_IMAGE_MODEL ?? "openai/gpt-5-image";
  const imgs = await Promise.all(refs.filter(Boolean).map(toInline));
  // OpenRouter's chat-completions image path has NO input_fidelity lever, so when this render
  // needed HIGH fidelity (a product/face lock that would be set on the native OpenAI path) we
  // compensate in the PROMPT — an explicit pixel-exact reproduction clause — so a failover onto
  // this host doesn't silently drop the subject lock. (opts.inputFidelity is "high" only when the
  // caller/profile asked for it; "low"/undefined shots are unaffected.)
  const fidelityClause = opts.inputFidelity === "high" && refs.filter(Boolean).length
    ? "\n\nCRITICAL — reproduce the attached subject(s) EXACTLY, pixel-for-pixel: the same shape, proportions, colours, materials and EVERY word of on-pack or on-garment text, and (for a person) the exact face, features and skin. Do NOT reinterpret, restyle, beautify or relabel the subject; only the scene around it may change."
    : "";
  const text = (opts.aspect ? `${prompt}\n\nRender the final image at a ${opts.aspect} aspect ratio.` : prompt) + fidelityClause;
  const content: unknown[] = [
    { type: "text", text },
    ...imgs.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mimeType};base64,${im.data}` } })),
  ];
  const body = { model, messages: [{ role: "user", content }], modalities: ["image", "text"] };
  let lastErr = "no image returned";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: any = await res.json().catch(() => null);
      if (j?.error) {
        lastErr = j.error.message ?? "OpenRouter error";
        // A quota / credit / billing error will never resolve on retry — fail fast so the
        // caller surfaces the billing message instead of spinning.
        if (/quota|insufficient|credit|billing|payment|rate.?limit/i.test(lastErr)) throw new Error(`OpenRouter: ${lastErr}`);
      }
      const out: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (out) {
        const m = out.match(/^data:(.+?);base64,(.*)$/s);
        if (m) return save(id, m[2]);
        if (/^https?:\/\//i.test(out)) return persistRemote(id, out);
      }
      // Text-only reply (no image) → retry with backoff.
    } catch (e) {
      lastErr = (e as Error).message;
      if (/^OpenRouter:/.test(lastErr)) throw e; // hard billing/quota error → don't spin
    }
    await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
  }
  throw new Error(`OpenRouter returned no image (after retries): ${lastErr}`);
}

type DispatchOpts = { aspect?: string; imageSize?: string; multiSubject?: boolean; preferGemini?: boolean; preferReplicate?: boolean; inputFidelity?: string; finish?: FinishGrade };

// A pure TRANSPORT failure — the request never reached the provider (DNS / socket / TLS / a
// reset before any HTTP status came back). The OpenAI SDK surfaces this as APIConnectionError
// (message "Connection error.") / APIConnectionTimeoutError; a raw fetch (Gemini/OpenRouter)
// surfaces it as a TypeError "fetch failed" with an undici cause. Crucially it is NOT a billing,
// quota, or "returned no image" error — those carry an HTTP status and would fail IDENTICALLY on
// any provider, so they must never trigger failover.
function isTransportError(e: unknown): boolean {
  const err = e as { name?: string; code?: string; message?: string; status?: number; cause?: { code?: string; message?: string } } | undefined;
  if (!err) return false;
  if (typeof err.status === "number") return false;               // got an HTTP response → provider was reached
  const name = err.name ?? "";
  const text = `${err.code ?? ""} ${err.message ?? ""} ${err.cause?.code ?? ""} ${err.cause?.message ?? ""}`;
  if (/APIConnectionError|APIConnectionTimeoutError|FetchError/i.test(name)) return true;
  return /connection error|fetch failed|network|socket hang ?up|timed out|und_err|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|EPIPE/i.test(text);
}

// Ordered renderers to attempt: the chosen one first, then OTHER configured multi-image APIs on a
// DIFFERENT host — so a blip reaching one provider (api.openai.com resets) transparently retries
// on Azure / Gemini instead of failing the shot. Higgsfield & Replicate stay primary-only (premium
// / single-subject); they aren't failover TARGETS. multiSubject frames never fall onto Replicate.
function renderChain(chosen: Renderer, _multiSubject: boolean): Renderer[] {
  const configured: Partial<Record<Renderer, boolean>> = {
    "azure-image": azureImageEnabled(),
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
  };
  const order: Renderer[] = ["azure-image", "openai", "gemini", "openrouter"];
  return [chosen, ...order.filter((r) => r !== chosen && configured[r])];
}

function renderWith(r: Renderer, id: string, prompt: string, refs: string[], opts: DispatchOpts): Promise<string> {
  switch (r) {
    case "higgsfield": return renderHiggsfield(id, prompt, refs);
    case "replicate": return renderReplicate(id, prompt, refs, { aspect: opts.aspect });
    case "azure-image": return renderAzureImage(id, prompt, refs, { aspect: opts.aspect, inputFidelity: opts.inputFidelity });
    case "openai": return renderOpenAI(id, prompt, refs, { aspect: opts.aspect, inputFidelity: opts.inputFidelity });
    case "openrouter": return renderOpenRouter(id, prompt, refs, { aspect: opts.aspect, inputFidelity: opts.inputFidelity });
    case "gemini": return renderGemini(id, prompt, refs, opts);
    default: return Promise.resolve(mockPlaceholder(id, prompt.slice(0, 40)));
  }
}

/** Shared renderer dispatch — provider-swappable, used by both product and model paths. */
async function dispatch(id: string, prompt: string, refs: string[], opts: DispatchOpts): Promise<string> {
  // A restage shot prefers Gemini (see renderShot) — but never override a real Higgsfield
  // production renderer, which handles multi-image itself. A campaign-vibe reference can opt into
  // the open-source model (preferReplicate); it too defers to a configured Higgsfield.
  const chosen =
    opts.preferReplicate && process.env.REPLICATE_API_TOKEN && activeRenderer() !== "higgsfield" ? "replicate"
    : opts.preferGemini && activeRenderer() !== "higgsfield" ? "gemini"
    : pickRenderer(opts.multiSubject ?? false);
  if (chosen === "mock") return mockPlaceholder(id, prompt.slice(0, 40)); // data URI — nothing to grade
  const chain = renderChain(chosen, opts.multiSubject ?? false);
  let url: string | undefined;
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    try { url = await renderWith(chain[i], id, prompt, refs, opts); break; }
    catch (e) {
      lastErr = e;
      // Only a pure transport failure is worth retrying on a DIFFERENT host — anything else
      // (billing, quota, no-image) would fail the same way everywhere, so re-throw immediately.
      if (i < chain.length - 1 && isTransportError(e)) {
        console.warn(`[render] ${chain[i]} unreachable (${(e as Error)?.message}); failing over to ${chain[i + 1]}`);
        continue;
      }
      throw e;
    }
  }
  if (url === undefined) throw lastErr ?? new Error("no renderer produced an image");
  // FINISHING PASS — the single choke point every real render passes through. The brand's
  // grade (from their own photos) is applied here by sharp, AFTER the model, so the final
  // colour never comes from the image model and the whole set reads as one photographer.
  // Always-on but subtle; NEUTRAL_GRADE keeps even an un-researched brand off the flat,
  // floaty AI look. Runs BEFORE QC (the caller QCs this returned url = the finished frame).
  await finishInPlace(url, opts.finish ?? NEUTRAL_GRADE);
  return url;
}
