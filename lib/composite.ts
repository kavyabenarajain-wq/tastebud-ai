import sharp from "sharp";
import { toDataUri, persistBuffer } from "./image";
import { removeBackground, enhanceEnabled } from "./enhance";

/**
 * PRODUCT-CUTOUT COMPOSITING — make product fidelity MECHANICAL, not hopeful.
 *
 * The renderer reproduces the product from a prompt + reference; even at high input_fidelity it can
 * still drift a half-tone or a cap thread. This guarantees the pixels by compositing the client's
 * REAL product (background removed) back onto the rendered scene, so the hero object in the delivered
 * frame is literally their product — not a regenerated likeness.
 *
 * INERT by default, behind TWO independent gates:
 *   • PRODUCT_COMPOSITE=1   — turns the feature on. Deliberately SEPARATE from the renderer selection,
 *                             so enabling Replicate for the cutout never silently reroutes rendering.
 *   • REPLICATE_API_TOKEN   — required for the BiRefNet cutout (removeBackground()); enhanceEnabled().
 *
 * v1 scope + honesty: this composites a background-removed cutout onto the render's located product
 * region. It shines on hero / packshot / straight-on angles where the real product's pose matches the
 * render. It is NOT a perspective or relight solver — three-quarter and in-hand angles should stay on
 * the prompt+QC path until this is tuned against real shoots. That is why it ships behind a flag, off.
 * Best-effort throughout: any failure returns the original render unchanged — a shot is never lost.
 */

export const productCompositeEnabled = () => process.env.PRODUCT_COMPOSITE === "1";

async function loadBuf(src: string): Promise<Buffer> {
  const uri = await toDataUri(src);
  return Buffer.from(uri.split(",")[1] ?? "", "base64");
}

/** Locate the product's bounding box in the render via edge-energy saliency (normalised → px). */
async function locateProductBox(
  renderBuf: Buffer,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const meta = await sharp(renderBuf).metadata();
  const W0 = meta.width ?? 0;
  const H0 = meta.height ?? 0;
  if (!W0 || !H0) return null;
  const GW = 48;
  const GH = Math.max(8, Math.round((GW * H0) / W0));
  const { data, info } = await sharp(renderBuf).greyscale().resize(GW, GH, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const L = (x: number, y: number) => data[y * W + x] / 255;

  // Local edge energy: high where the product/subject is, low over calm background.
  const busy = new Float32Array(W * H);
  let max = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.abs(L(x, y) - L(Math.min(W - 1, x + 1), y)) + Math.abs(L(x, y) - L(x, Math.min(H - 1, y + 1)));
      busy[y * W + x] = e;
      if (e > max) max = e;
    }
  if (max <= 0) return null;

  // The product box = the tight bounds of everything above a fraction of peak edge energy.
  const thr = max * 0.35;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (busy[y * W + x] >= thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0 || y1 < y0) return null;

  const left = Math.max(0, Math.round((x0 / W) * W0));
  const top = Math.max(0, Math.round((y0 / H) * H0));
  const width = Math.min(W0 - left, Math.round(((x1 - x0 + 1) / W) * W0));
  const height = Math.min(H0 - top, Math.round(((y1 - y0 + 1) / H) * H0));
  if (width < 8 || height < 8) return null;
  return { left, top, width, height };
}

/**
 * Composite the client's REAL product (background removed) onto a rendered scene, sized to the
 * render's product region. Returns the served path of the composited frame — or the original render
 * url unchanged when the feature is off, the token is absent, or anything fails (never lose a shot).
 */
export async function compositeRealProduct(args: { renderUrl: string; productSrc: string }): Promise<string> {
  if (!productCompositeEnabled() || !enhanceEnabled()) return args.renderUrl;
  try {
    const cutoutPath = await removeBackground({ src: args.productSrc }); // BiRefNet transparent PNG (Replicate)
    const [renderBuf, cutoutBuf] = await Promise.all([loadBuf(args.renderUrl), loadBuf(cutoutPath)]);
    const box = await locateProductBox(renderBuf);
    if (!box) return args.renderUrl;
    // Trim the cutout's transparent margins, then CONTAIN it inside the located box, centred.
    const trimmed = await sharp(cutoutBuf).trim().toBuffer().catch(() => cutoutBuf);
    const fitted = await sharp(trimmed).resize(box.width, box.height, { fit: "inside" }).png().toBuffer();
    const fMeta = await sharp(fitted).metadata();
    const left = Math.max(0, box.left + Math.round((box.width - (fMeta.width ?? box.width)) / 2));
    const top = Math.max(0, box.top + Math.round((box.height - (fMeta.height ?? box.height)) / 2));
    const out = await sharp(renderBuf).composite([{ input: fitted, left, top }]).png().toBuffer();
    return persistBuffer(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}-comp`, out);
  } catch {
    return args.renderUrl; // never lose the shot to a compositing failure
  }
}
