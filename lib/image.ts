import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import OpenAI, { toFile } from "openai";
import { runReplicate, firstUrl } from "./replicate";

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

type Renderer = "higgsfield" | "replicate" | "azure-image" | "openai" | "gemini" | "mock";

export function activeRenderer(): Renderer {
  // Explicit override — decouples the image provider from the brain's key. Set
  // IMAGE_PROVIDER=gemini to render on Gemini while OpenAI/Azure still drives chat.
  const forced = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if ((forced === "azure" || forced === "azure-image") && azureImageEnabled()) return "azure-image";
  if (forced === "replicate" && process.env.REPLICATE_API_TOKEN) return "replicate";
  if (forced === "higgsfield" && process.env.HIGGSFIELD_API_KEY) return "higgsfield";
  // Auto precedence when no (valid) override is set.
  if (process.env.HIGGSFIELD_API_KEY) return "higgsfield";
  if (process.env.REPLICATE_API_TOKEN) return "replicate"; // open-source FLUX Kontext — fast
  if (azureImageEnabled()) return "azure-image"; // use Azure image gen when a deployment is set
  if (process.env.OPENAI_API_KEY) return "openai";
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
  await mkdir(GEN_DIR, { recursive: true });
  await writeFile(join(GEN_DIR, `${id}.png`), Buffer.from(b64, "base64"));
  return `/api/img/${id}.png`;
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

// Core image render over the OpenAI SDK — shared by the platform and Azure paths
// (Azure's v1 endpoint speaks the same images API; only client + model differ).
async function renderImageSDK(client: OpenAI, model: string, id: string, prompt: string, products: string[], opts: { aspect?: string }): Promise<string> {
  const size = openaiSize(opts.aspect);
  const quality = (process.env.OPENAI_IMAGE_QUALITY ?? "medium") as "low" | "medium" | "high" | "auto";
  const refs = products.filter(Boolean);
  // Edit FROM the attached subject image(s) so the real subject is preserved exactly.
  // input_fidelity:"high" is gpt-image-1's lever to hold that subject TRUE — the EXACT face of a
  // pasted model reference (reproduce the person, don't reinterpret them) and the exact product
  // shape/label. ~22× the input-image tokens vs "low", but fidelity is the product's #1 rule.
  // Env-tunable (OPENAI_INPUT_FIDELITY=low) to trade fidelity for cost.
  const inputFidelity = (process.env.OPENAI_INPUT_FIDELITY || "high").toLowerCase();
  let d: { b64_json?: string; url?: string } | undefined;
  if (refs.length) {
    const image = await Promise.all(refs.map(toUploadable));
    const editParams = { model, image, prompt, size, quality, input_fidelity: inputFidelity } as unknown as Parameters<typeof client.images.edit>[0];
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
function renderOpenAI(id: string, prompt: string, products: string[], opts: { aspect?: string }): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return renderImageSDK(client, process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5", id, prompt, products, opts);
}

// Azure image gen — uses the Azure endpoint + key and the AZURE_IMAGE_DEPLOYMENT name.
function renderAzureImage(id: string, prompt: string, products: string[], opts: { aspect?: string }): Promise<string> {
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
export async function qcImage(args: { url: string; checklist: string[]; brand: string; productRef?: string }): Promise<{ pass: boolean; reasons: string[] }> {
  // QC runs on Gemini vision whenever its key is present — independent of which
  // provider rendered the shot — so OpenAI renders still get reviewed.
  if (!process.env.GEMINI_API_KEY) return { pass: true, reasons: [] };
  try {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
    const ref = await toInline(args.url);
    const checklist = args.checklist.length
      ? args.checklist
      : ["Real photography, not a 3D/CGI/plastic/AI render", "Product, label and text intact and legible", "On-brand, professional, well-composed", "Background and lighting look intentional and clean"];
    const parts: any[] = [];
    let prompt: string;
    if (args.productRef) {
      const orig = await toInline(args.productRef);
      parts.push({ inline_data: { mime_type: orig.mimeType, data: orig.data } });
      const extra = args.checklist.length ? `\nADDITIONALLY, for IMAGE 2 ALL of the following must be TRUE — fail if any is false:\n` + args.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + `\n` : "";
      prompt =
        `You are a STRICT photography QC reviewer for the brand "${args.brand}".\n` +
        `IMAGE 1 is the ORIGINAL product the client uploaded. IMAGE 2 is a generated photo of it in a new scene.\n` +
        `IMAGE 1 may also contain a hand, fingers, nails, props or a background — IGNORE all of that and compare ONLY the product object itself.\n` +
        `FAIL if the PRODUCT in IMAGE 2 differs from the product in IMAGE 1 in shape, silhouette, proportions, cap/closure, label, logo, any text/wording, or colours — it must be the SAME product, only in a new setting.\n` +
        `Also fail if IMAGE 2 looks distorted, fake, melted or obviously AI-generated, OR if it reproduces a hand/fingers/background copied from IMAGE 1. Do NOT penalise a different camera angle, background or lighting.${extra}` +
        `When the product clearly matches and the photo is clean, pass.\n` +
        `Return STRICT JSON ONLY: {"pass":true|false,"reasons":["short reason", ...]}`;
    } else {
      prompt =
        `You are a STRICT product-photography QC reviewer for the brand "${args.brand}". Judge ONE image on its own merits against:\n` +
        checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") +
        `\nFail ONLY if the product looks distorted, fake, warped, melted, mislabelled, or obviously AI-generated. When in doubt, pass.\n` +
        `Return STRICT JSON ONLY: {"pass":true|false,"reasons":["short reason", ...]}`;
    }
    parts.unshift({ text: prompt });
    parts.push({ inline_data: { mime_type: ref.mimeType, data: ref.data } });
    const body = { contents: [{ parts }] };
    const j = await geminiCall(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, body, 2);
    const text: string = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { pass: true, reasons: [] };
    const parsed = JSON.parse(m[0]);
    return { pass: !!parsed.pass, reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [] };
  } catch {
    return { pass: true, reasons: [] };
  }
}

/**
 * Vision pre-pass: LOOK at the uploaded product and report its observed facts —
 * above all the packaging COLOURS — so the (otherwise blind) art director can key
 * the scene to the real product when the client says "match the product". Cheap,
 * runs on Gemini flash; returns null when no key or on any failure (planner then
 * falls back to brand palette text, as before).
 */
export type ProductObservation = {
  colors: { name: string; hex: string; role: string }[];
  material: string;
  summary: string;
};
export async function analyzeProduct(productRef: string): Promise<ProductObservation | null> {
  if (!process.env.GEMINI_API_KEY || !productRef) return null;
  try {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_QC_MODEL ?? "gemini-2.5-flash";
    const img = await toInline(productRef);
    const prompt =
      `You are a product-photography colour analyst. LOOK at this product's packaging and report ONLY what you can see.\n` +
      `Identify the DOMINANT brand/packaging colours (the colours a designer would key a campaign to), each with a plain colour name, an approximate hex, and its role ("primary" for the main packaging colour, "accent", "cap", "text", "background").\n` +
      `Order colours by visual dominance, primary first. IGNORE any hand, prop, surface or background around the product — only the product/packaging itself.\n` +
      `Also note the main material/finish (e.g. "frosted glass bottle", "matte aluminium tube", "glossy carton") and a one-line summary.\n` +
      `Return STRICT JSON ONLY: {"colors":[{"name":"","hex":"#RRGGBB","role":""}],"material":"","summary":""}`;
    const body = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: img.mimeType, data: img.data } }] }] };
    const j = await geminiCall(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, body, 2);
    const text: string = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const colors = (Array.isArray(parsed.colors) ? parsed.colors : [])
      .map((c: any) => ({ name: String(c?.name ?? "").trim(), hex: String(c?.hex ?? "").trim(), role: String(c?.role ?? "").trim() }))
      .filter((c: any) => c.name || c.hex)
      .slice(0, 6);
    if (!colors.length) return null;
    return { colors, material: String(parsed.material ?? "").trim(), summary: String(parsed.summary ?? "").trim() };
  } catch {
    return null;
  }
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
  "Render as REAL studio photography, shot on a full-frame camera with a prime/macro lens: ONE coherent light source with believable soft shadows, true material behaviour (glass refracts, metal speculars, matte stays matte), the product grounded with a real contact shadow and a faint reflection, shallow depth of field, tack-sharp, true-to-life neutral colour. A specific, designed background/surface — never a flat generic void. Photographic — never a 3D, CGI, plastic, waxy or AI-render look.";

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
  "Colour and tonality of Kodak Portra 400 / Fujifilm Pro 400H film: gentle highlight roll-off, true-to-life skin tones, fine organic film grain, and NO digital over-sharpening, no HDR clarity, no plastic gloss. " +
  "Light is MOTIVATED and physical — soft overcast daylight through a window, warm low golden-hour sun, or a single soft directional source in a real room — never flat, even, sourceless light. " +
  "Embrace natural imperfection, because real life is imperfect: a few flyaway hairs, visible skin pores and real skin texture, faint smile and expression lines, a relaxed unposed posture, a candid in-between-moments expression, and subtle natural asymmetry. The frame must read as one real shot from an editorial photoshoot a person actually took.";

const HUMAN_REALISM =
  "Render as REAL photography of a REAL human being, shot on a full-frame camera with a portrait prime lens. The person MUST pass as genuinely photographed: skin has visible pores, fine texture, peach fuzz and true subsurface scattering (never airbrushed, waxy or plastic); eyes are alive with real catchlights, correct iris and moisture; hands have exactly five natural fingers with believable grip; teeth vary naturally; hair has real strands, flyaways and a believable hairline; the face and body carry slight human asymmetry. One coherent light source falling believably on skin, shallow depth of field, true skin colour. Never a 3D, CGI, doll, plastic or AI-render look — the single fastest way to break the brand is a model who looks like AI.";

const MODEL_REF_LOCK =
  "IDENTITY LOCK — the FIRST attached image(s) are a LIKENESS REFERENCE of the MODEL: a real person the client wants in the shoot. Take ONLY the PERSON from it — their face shape, features, skin tone, hair and body — and reproduce them faithfully and recognisably in every frame. Do NOT beautify them away: do not slim, lighten, smooth, or swap them for a more conventional face. " +
  "CRITICAL — THIS IS NOT A PRODUCT REFERENCE: ignore ANYTHING the person is wearing, holding, applying or using in this image, and ignore any garment, logo, label, packaging, bottle, can or branding visible in it. NONE of that is the product, and none of it may appear in the result. The clothing, props and styling are yours to redesign for the brand. You may re-light, re-dress and re-stage the person freely — only the human likeness stays fixed and consistent across the set.";

const HUMAN_NEGATIVES = [
  "extra or missing fingers", "warped, fused or distorted hands", "deformed or duplicated limbs",
  "waxy, plastic, airbrushed or CGI skin", "over-smoothed, beauty-filtered or retouched-poreless skin",
  "over-sharpened HDR clarity look", "glossy Instagram-filter sheen", "flat, even, sourceless lighting",
  "dead, glassy or mismatched eyes", "uniform tile-white teeth",
  "helmet-like or unnatural hair", "uncanny perfect symmetry", "doll-like or mannequin face",
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
  products?: string[]; // optional product to place on the model
  references?: string[]; // optional style/look references
  referencesAreBrand?: boolean; // true when references are the brand's OWN published photos
  aspect?: string;
  imageSize?: string;
}): Promise<string> {
  const modelRefs = (args.modelRefs ?? []).filter(Boolean);
  const products = (args.products ?? []).filter(Boolean);
  const references = (args.references ?? []).filter(Boolean);
  const negatives = [...(args.negatives ?? []), ...(args.extraNegatives ?? []), ...HUMAN_NEGATIVES, ...ANTI_CLICHE_NEGATIVES];
  if (modelRefs.length && products.length) negatives.push("copying the product, garment, packaging, logo or branding from the model/likeness image", "featuring any product other than the one in the product image");
  if (products.length) negatives.push("garment stretched over the whole body", "a bottom garment pulled up as a strapless wrap", "clothing worn in the wrong anatomical position", "a flat cut-out garment pasted onto the body", "model left partially, oddly or impossibly dressed", "distorted or unrealistic garment fit");

  const blocks: string[] = [];
  blocks.push(CAPTURE_FIRST); // lead camera-first — this is what kills the AI look
  if (modelRefs.length) blocks.push(MODEL_REF_LOCK);
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
  }
  blocks.push(args.prompt);
  if (products.length) blocks.push(WARDROBE_REALISM);
  blocks.push(`Avoid: ${negatives.join(", ")}.`);
  blocks.push(HUMAN_REALISM);
  blocks.push(CLEAN_FRAME);
  if (references.length) {
    blocks.push(
      args.referencesAreBrand
        ? `BRAND LOOK — the LAST attached image(s) are this brand's OWN published photography (their real website / feed). Match their visual signature so this frame belongs in THAT feed: wardrobe register and styling, set and palette, colour grade, lighting quality and direction, mood and crop. Do NOT copy any person, face or product from them — only the art-direction and taste.`
        : `STYLE REFERENCE — the LAST attached image(s) are a LOOK reference only (wardrobe register, set, palette, lighting, mood). Match that art direction, but do NOT copy any person, face or product from it.`
    );
  }
  const fullPrompt = blocks.join("\n\n");

  // Order: model identity first, then product, then style references.
  const refs = [...modelRefs, ...products, ...references];
  // Model frames are inherently multi-subject (person + product/refs) — keep them on
  // the proven multi-image renderer, not the single-image Replicate editor.
  return dispatch(args.id, fullPrompt, refs, { aspect: args.aspect, imageSize: args.imageSize, multiSubject: true });
}

export async function renderShot(args: {
  id: string;
  prompt: string;
  angle?: string; // the specific camera angle this shot must be taken from
  negatives?: string[];
  extraNegatives?: string[]; // stored compliance do-not, re-injected on every (re)render
  products: string[];
  references?: string[]; // style/look references to emulate (NOT the product)
  referencesAreBrand?: boolean; // true when references are the brand's OWN published photos
  aspect?: string;
  imageSize?: string;
}): Promise<string> {
  const products = (args.products ?? []).filter(Boolean);
  const references = (args.references ?? []).filter(Boolean);
  const negatives = [...(args.negatives ?? []), ...(args.extraNegatives ?? []), ...ANTI_CLICHE_NEGATIVES, "altering, redrawing, restyling or relabelling the product", "changing the product's shape, colour or text", "inventing a different product",
    // Product photoshoot = product-only. Humans belong in the model shoot.
    "any person, model or human in frame", "a hand, fingers, arm, leg, foot or any body part in frame", "the product being held, worn, touched or carried by a person"];
  // Camera angle is enforced HERE, not just in the art-director prose: in edit mode the
  // model anchors to the reference photo's framing, so we explicitly move the camera and
  // permit re-orienting the product (identity fixed) to hit genuinely distinct viewpoints.
  const angleLock = args.angle
    ? `\n\nCAMERA ANGLE — THIS shot is photographed from a specific viewpoint: ${args.angle}. Move the CAMERA to that exact position, elevation and distance and compose for it, EVEN IF it differs from how the product sits in the reference image. You MAY rotate, tilt and re-orient the product to present this viewpoint (e.g. show its top for an overhead, its underside for a base shot, look up at it for a low angle, or fill the frame for a macro) — the product's identity, shape, label, text and colours stay 100% fixed; only the camera and the product's orientation change. Do NOT simply reproduce the reference photo's framing — this must be a genuinely different angle from the other shots in the set.`
    : "";
  let fullPrompt =
    `${PRODUCT_LOCK}${angleLock}\n\n${args.prompt}` +
    `\n\nAvoid: ${negatives.join(", ")}.` +
    `\n\n${REALISM_ANCHOR}`;
  if (references.length) {
    const which = references.length === 1 ? "the LAST attached image is" : `the LAST ${references.length} attached images are`;
    fullPrompt += args.referencesAreBrand
      ? `\n\nBRAND LOOK — ${which} this brand's OWN published photography, pulled from their real website / feed. This is the visual signature the result MUST belong to: study and match their background and palette, surface and set, prop / styling density, colour grade, lighting quality and direction, depth of field, mood and crop. The new shot should look like it could sit in THIS brand's actual feed next to these — same photographic world, same taste. Do NOT copy the product, label, text or branding from these images; the product comes only from the first image(s) and the scene from the brief.`
      : `\n\nSTYLE REFERENCE — ${which} a LOOK reference, NOT the product. Match its art direction closely: background colour and palette, prop / ingredient styling and abundance, surface, lighting, mood and composition. Recreate THAT look around THIS product. Do NOT copy any product, label, text, or branding from the style reference — the product comes only from the first image(s).`;
  }
  // Product image(s) first (the subject), style references last (the look).
  const refs = [...products, ...references];
  // Single product, no extra refs → fast single-image Replicate path is safe. Multiple
  // products or style refs need compositing, so route those to a multi-image renderer.
  const multiSubject = products.length + references.length > 1;
  return dispatch(args.id, fullPrompt, refs, { aspect: args.aspect, imageSize: args.imageSize, multiSubject });
}

/** Shared renderer dispatch — provider-swappable, used by both product and model paths. */
function dispatch(id: string, prompt: string, refs: string[], opts: { aspect?: string; imageSize?: string; multiSubject?: boolean }): Promise<string> {
  switch (pickRenderer(opts.multiSubject ?? false)) {
    case "higgsfield":
      return renderHiggsfield(id, prompt, refs);
    case "replicate":
      return renderReplicate(id, prompt, refs, { aspect: opts.aspect });
    case "azure-image":
      return renderAzureImage(id, prompt, refs, { aspect: opts.aspect });
    case "openai":
      return renderOpenAI(id, prompt, refs, { aspect: opts.aspect });
    case "gemini":
      return renderGemini(id, prompt, refs, opts);
    default:
      return Promise.resolve(mockPlaceholder(id, prompt.slice(0, 40)));
  }
}
