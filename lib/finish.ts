import sharp from "sharp";
import { join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { FinishGrade } from "./types";

/**
 * The finishing pass — the deterministic grade that runs AFTER the image model, so the
 * final colour NEVER comes from the model (that's what makes a set stop looking "AI").
 * A gentle per-channel colour cast (built from the brand's real photos), a one-stop
 * S-curve, fine film grain and a light unsharp mask. Subtle by design: it unifies a set
 * into one photographer's look without shifting the product's true colour. Pure pixels,
 * no network, no model — sharp only.
 */

const GEN_DIR = join(process.cwd(), "generated");

// A neutral filmic default — used when a brand has no photo-derived grade yet. No colour
// shift (channels at 1.0), just a whisper of contrast, grain and sharpening so even an
// un-researched brand's output loses the flat, floaty, color-neutral model look.
export const NEUTRAL_GRADE: FinishGrade = {
  rMul: 1, gMul: 1, bMul: 1, saturation: 1.02, brightness: 1.0, contrast: 1.05, grain: 0.45, sharpen: 0.7,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Read a brand's OWN photos and distil a gentle numeric grade from their average tone:
 * the colour cast (per-channel, kept within ±6% so product colour survives) and a modest
 * saturation read. Contrast / grain / sharpen stay filmic constants — those are the
 * "shot on a camera" texture, not the brand's hue. Deterministic; sharp-only, no API.
 * Falls back to NEUTRAL_GRADE when no readable image is given.
 */
export async function deriveGrade(imageUrls: string[]): Promise<FinishGrade> {
  const urls = imageUrls.filter(Boolean).slice(0, 8);
  const means: { r: number; g: number; b: number }[] = [];
  for (const url of urls) {
    try {
      const buf = /^https?:\/\//i.test(url)
        ? Buffer.from(await (await fetch(url)).arrayBuffer())
        : await readFile(url.startsWith("/api/img/") ? join(GEN_DIR, basename(url)) : url);
      // Downscale before stats — we only want the average tone, cheaply.
      const small = await sharp(buf).resize(64, 64, { fit: "inside" }).removeAlpha().toBuffer();
      const { channels } = await sharp(small).stats();
      if (channels?.length >= 3) means.push({ r: channels[0].mean, g: channels[1].mean, b: channels[2].mean });
    } catch {
      /* skip an unreadable photo — one bad URL never sinks the grade */
    }
  }
  if (!means.length) return { ...NEUTRAL_GRADE };
  const avg = means.reduce((a, m) => ({ r: a.r + m.r, g: a.g + m.g, b: a.b + m.b }), { r: 0, g: 0, b: 0 });
  avg.r /= means.length; avg.g /= means.length; avg.b /= means.length;
  const luma = 0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b || 1;
  // Nudge a neutral grey toward the brand's cast: relative channel, softened (√) and clamped.
  const cast = (c: number) => clamp(Math.sqrt(c / luma), 0.94, 1.06);
  // Chroma of the average tone → a small saturation lean (a colourful brand feed → slightly
  // richer output; a muted, desaturated feed → slightly pulled back).
  const chroma = (Math.max(avg.r, avg.g, avg.b) - Math.min(avg.r, avg.g, avg.b)) / luma;
  const saturation = clamp(0.98 + (chroma - 0.15) * 0.4, 0.9, 1.08);
  return { rMul: cast(avg.r), gMul: cast(avg.g), bMul: cast(avg.b), saturation, brightness: 1.0, contrast: 1.06, grain: 0.5, sharpen: 0.75 };
}

/** Apply the grade to one image buffer and return the finished PNG buffer. */
export async function applyFinish(buf: Buffer, grade: FinishGrade): Promise<Buffer> {
  const c = clamp(grade.contrast ?? 1, 0.9, 1.2);
  // One linear pass carries BOTH the colour cast and the contrast S-curve pivoted on mid-grey:
  // channel a = mul × slope, b = 128 × (1 − slope) so grey stays grey while contrast lifts.
  const a = [grade.rMul * c, grade.gMul * c, grade.bMul * c];
  const b = [128 * (1 - c), 128 * (1 - c), 128 * (1 - c)];
  let pipe = sharp(buf).removeAlpha().linear(a, b).modulate({ saturation: clamp(grade.saturation ?? 1, 0.85, 1.15), brightness: clamp(grade.brightness ?? 1, 0.95, 1.05) });
  if ((grade.sharpen ?? 0) > 0) pipe = pipe.sharpen({ sigma: clamp(grade.sharpen, 0.3, 1.5) });
  let out = await pipe.png().toBuffer();

  // Film grain — one honest imperfection at the pixel level. A gaussian-noise grey plate
  // in soft-light barely moves mid-tones (grey ≈ no-op) but seats a fine, even grain over
  // the whole frame, so it reads as one film stock rather than a clean digital render.
  const g = clamp(grade.grain ?? 0, 0, 1);
  if (g > 0) {
    const meta = await sharp(out).metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    if (w && h) {
      const sigma = 5 + g * 12; // subtle → visible-but-not-loud
      const noise = await sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma } } }).png().toBuffer();
      out = await sharp(out).composite([{ input: noise, blend: "soft-light" }]).png().toBuffer();
    }
  }
  return out;
}

/**
 * Finish a served render IN PLACE — read /generated/<id>.png, grade it, write it back.
 * Best-effort: any failure leaves the original render untouched, so finishing can never
 * turn a good shot into a broken one. This is the single choke point every render passes
 * through (see image.ts dispatch), so the whole set comes out of one grade.
 */
export async function finishInPlace(servedPath: string, grade: FinishGrade): Promise<void> {
  if (!servedPath?.startsWith("/api/img/")) return; // data-URI mock / remote → nothing on disk to grade
  try {
    const file = join(GEN_DIR, basename(servedPath));
    const finished = await applyFinish(await readFile(file), grade);
    await writeFile(file, finished);
  } catch {
    /* leave the un-graded render in place rather than losing the shot */
  }
}
