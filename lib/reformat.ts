import sharp from "sharp";
import { toDataUri, persistBuffer } from "./image";
import { editImage, enhanceEnabled } from "./enhance";

/**
 * Fidelity-safe reformat — adapt an existing keeper to another placement WITHOUT
 * re-rendering it (a re-render can drift the product; product fidelity is absolute).
 * Brushless bar: "no drift across hundreds of variations … first draft to the last resize."
 *
 * Order of preference:
 *   1. small aspect change → deterministic centre CROP — the product pixels are untouched
 *   2. big change + enhancers on → generative OUTPAINT: pad the canvas, then have the
 *      instruction-edit model extend the SCENE into the padding — the original frame is
 *      preserved and the product never sits inside the regenerated region
 *   3. enhancers off → letterbox PAD on the image's own dominant colour
 * NEVER a silent re-render.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function ratioOf(aspect: string): number {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return 4 / 5;
  return w / h;
}

async function srcBuffer(src: string): Promise<Buffer> {
  const uri = await toDataUri(src);
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

// Above this fraction of the frame lost, a centre-crop risks cutting into the product /
// the concept — extend the canvas instead of cutting the scene.
const MAX_CROP_LOSS = 0.22;

export async function reformatImage(args: {
  src: string;
  targetAspect: string; // e.g. "9:16"
  constraints?: string; // the shot's stored compliance tail — rides through the outpaint edit
}): Promise<{ url: string; method: "crop" | "outpaint" | "pad" }> {
  const buf = await srcBuffer(args.src);
  const meta = await sharp(buf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error("could not read the image size");
  const cur = W / H;
  const target = ratioOf(args.targetAspect);
  const id = stamp();

  // Already (near enough) the target — persist a copy so the caller gets a fresh asset.
  if (Math.abs(cur - target) < 0.02) {
    return { url: await persistBuffer(`${id}-rf`, await sharp(buf).png().toBuffer()), method: "crop" };
  }

  // What a centre-crop to the target would discard.
  const cropW = target < cur ? Math.round(H * target) : W;
  const cropH = target < cur ? H : Math.round(W / target);
  const loss = 1 - (cropW * cropH) / (W * H);

  if (loss <= MAX_CROP_LOSS) {
    const out = await sharp(buf)
      .extract({ left: Math.round((W - cropW) / 2), top: Math.round((H - cropH) / 2), width: cropW, height: cropH })
      .png()
      .toBuffer();
    return { url: await persistBuffer(`${id}-crop`, out), method: "crop" };
  }

  // Big change → EXTEND the canvas to contain the whole original at the target aspect.
  const padW = target > cur ? Math.round(H * target) : W;
  const padH = target > cur ? H : Math.round(W / target);
  const { dominant } = await sharp(buf).stats(); // flat fill close to the scene so the seam is easy
  const background = { r: dominant.r, g: dominant.g, b: dominant.b };
  const top = Math.round((padH - H) / 2);
  const left = Math.round((padW - W) / 2);
  const padded = await sharp(buf)
    .extend({ top, bottom: padH - H - top, left, right: padW - W - left, background })
    .png()
    .toBuffer();

  if (enhanceEnabled()) {
    try {
      const url = await editImage({
        src: `data:image/png;base64,${padded.toString("base64")}`,
        instruction:
          "Extend the photograph seamlessly into the flat solid-colour margins: continue the existing background, surface, lighting and depth of field so the whole frame reads as ONE uninterrupted photo. " +
          "Do not move, crop, redraw, restyle or recolour anything already in the picture — the product especially must remain pixel-identical. No text, no borders, no vignette.",
        constraints: args.constraints,
      });
      return { url, method: "outpaint" };
    } catch {
      /* fall through to the letterbox pad */
    }
  }
  return { url: await persistBuffer(`${id}-pad`, padded), method: "pad" };
}
