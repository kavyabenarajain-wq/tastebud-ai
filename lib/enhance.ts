import { runReplicate, firstUrl, replicateEnabled } from "./replicate";
import { toDataUri, persistRemote } from "./image";

/**
 * Open-source creative enhancers, run on Replicate (hosted, no GPU to manage).
 * All gated on REPLICATE_API_TOKEN — callers should check `enhanceEnabled()` and
 * fall back to the Gemini path when it's off. Model ids are env-overridable so you
 * can pin a version or swap to a commercial-safe alternative without code changes.
 */

export const enhanceEnabled = replicateEnabled;

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Defaults chosen for fidelity + commercial-safety where possible; override via env.
const MODELS = {
  // Real-ESRGAN: detail-preserving SR that does NOT hallucinate the product away. Swap to SUPIR/clarity for more punch.
  upscale: () => process.env.REPLICATE_UPSCALE_MODEL || "nightmareai/real-esrgan",
  // BiRefNet (MIT): high-accuracy matting / background removal.
  bg: () => process.env.REPLICATE_BG_MODEL || "men1scus/birefnet",
  // IC-Light: relight a subject with motivated, prompt-driven light.
  relight: () => process.env.REPLICATE_RELIGHT_MODEL || "zsxkib/ic-light",
  // FLUX Kontext (hosted = licensed → commercial-OK output) for instruction edits that preserve the subject.
  edit: () => process.env.REPLICATE_EDIT_MODEL || "black-forest-labs/flux-kontext-pro",
};

/** Real super-resolution — replaces the "re-render at 4K" hack. Keeps the product/model unchanged. */
export async function upscale(args: { src: string; scale?: number; faceEnhance?: boolean }): Promise<string> {
  const image = await toDataUri(args.src);
  const out = await runReplicate(MODELS.upscale(), { image, scale: args.scale ?? 4, face_enhance: args.faceEnhance ?? false });
  return persistRemote(`${stamp()}-up`, firstUrl(out));
}

/** Background removal / clean cutout (transparent PNG) for compositing. */
export async function removeBackground(args: { src: string }): Promise<string> {
  const image = await toDataUri(args.src);
  const out = await runReplicate(MODELS.bg(), { image });
  return persistRemote(`${stamp()}-cut`, firstUrl(out));
}

/** Relight a product/model shot with motivated, consistent light. */
export async function relight(args: { src: string; prompt: string; constraints?: string }): Promise<string> {
  const subject = await toDataUri(args.src);
  // IC-Light forks differ on the input key; pass both common names so a swap still works.
  const out = await runReplicate(MODELS.relight(), { subject_image: subject, image: subject, prompt: args.prompt + (args.constraints ?? ""), light_source: "Use Background Image" });
  return persistRemote(`${stamp()}-relit`, firstUrl(out));
}

/** Instruction edit (FLUX Kontext / Qwen-Image-Edit) — change one thing, keep the rest faithful.
 *  `constraints` re-injects the shot's stored do-not / product-lock so the edit can't drift off-brand. */
export async function editImage(args: { src: string; instruction: string; constraints?: string }): Promise<string> {
  const input_image = await toDataUri(args.src);
  const out = await runReplicate(MODELS.edit(), { prompt: args.instruction + (args.constraints ?? ""), input_image, image: input_image, output_format: "png" });
  return persistRemote(`${stamp()}-edit`, firstUrl(out));
}
