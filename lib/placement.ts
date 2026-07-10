import sharp from "sharp";
import { toDataUri } from "./image";
import type { CopyAnchor, CopyLayout, ShotPlacement } from "./types";

/**
 * IMAGE-AWARE COPY PLACEMENT — read the actual photo and decide WHERE its copy should sit.
 *
 * The run's treatment fixes the brand VOICE (case / weight / scale / CTA form); this decides
 * the PLACEMENT per shot so a set varies the way real editorial campaigns do: copy lands in
 * whatever region THIS frame left empty, clear of the product/subject. It's a cheap saliency
 * pass — downscale to a small grey grid, measure local edge energy (busy = product, calm =
 * negative space), and map the calmest safe region to a layout + anchor.
 *
 * Server-only (sharp). Best-effort: any failure returns null and the run treatment stands.
 */
export async function analyzePlacement(src: string, aspectStr: string): Promise<ShotPlacement | null> {
  try {
    const dataUri = await toDataUri(src);
    const buf = Buffer.from(dataUri.split(",")[1] ?? "", "base64");

    const [aw, ah] = (aspectStr || "").split(":").map(Number);
    const ar = aw && ah ? aw / ah : 0.8; // width / height
    const GW = 40;
    const GH = Math.max(8, Math.round(GW / ar));
    const { data, info } = await sharp(buf).greyscale().resize(GW, GH, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const L = (x: number, y: number) => data[y * W + x] / 255;

    // Local edge energy: high where the product/subject is, low over calm background.
    const busy = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        busy[y * W + x] = Math.abs(L(x, y) - L(Math.min(W - 1, x + 1), y)) + Math.abs(L(x, y) - L(x, Math.min(H - 1, y + 1)));

    const stat = (x0: number, y0: number, x1: number, y1: number): { busy: number; lum: number } => {
      const X0 = Math.max(0, Math.floor(x0 * W)), X1 = Math.min(W, Math.ceil(x1 * W));
      const Y0 = Math.max(0, Math.floor(y0 * H)), Y1 = Math.min(H, Math.ceil(y1 * H));
      let b = 0, l = 0, n = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { b += busy[y * W + x]; l += L(x, y); n++; }
      return n ? { busy: b / n, lum: l / n } : { busy: 1, lum: 0.5 };
    };

    const vertical = ar <= 0.62;
    const mTop = vertical ? 0.15 : 0.07;
    const mBot = vertical ? 0.2 : 0.08;
    const mx = 0.06;
    const bandH = vertical ? 0.22 : 0.26;

    // Candidate placement regions, all inside the platform safe area.
    const cands: Array<{ key: string; layout: CopyLayout; rect: [number, number, number, number]; anchor?: CopyAnchor }> = [
      { key: "top", layout: "editorial-top", rect: [mx, mTop, 1 - mx, mTop + bandH] },
      { key: "bottom", layout: "lower-third", rect: [mx, 1 - mBot - bandH, 1 - mx, 1 - mBot] },
      { key: "center", layout: "center", rect: [0.16, 0.4, 0.84, 0.6] },
      { key: "left", layout: "side-rail", rect: [mx, 0.28, mx + 0.42, 0.72], anchor: "center-left" },
      { key: "right", layout: "side-rail", rect: [1 - mx - 0.42, 0.28, 1 - mx, 0.72], anchor: "center-right" },
    ];
    const scored = cands.map((c) => ({ ...c, ...stat(...c.rect) }));
    const byKey = Object.fromEntries(scored.map((s) => [s.key, s]));
    scored.sort((a, b) => a.busy - b.busy);
    let best = scored[0];
    let layout = best.layout;
    let anchor = best.anchor;

    // Product HORIZONTALLY CENTERED (both ends calm, both side rails busy) → split the copy
    // around it. When the product is lateralised instead, the calmest candidate (a side rail
    // or an open band) already won above, so don't force a split.
    const t = byKey.top, b = byKey.bottom, c = byKey.center, lft = byKey.left, rgt = byKey.right;
    if (t && b && c && lft && rgt && t.busy < c.busy * 0.72 && b.busy < c.busy * 0.72 && lft.busy > c.busy * 0.55 && rgt.busy > c.busy * 0.55) {
      layout = "split";
      anchor = undefined;
      best = t.busy <= b.busy ? t : b;
    } else if (layout === "editorial-top") {
      // Pick the calmest of the three top columns for the corner anchor.
      const cols: Array<{ a: CopyAnchor; busy: number }> = [
        { a: "top-left" as CopyAnchor, busy: stat(mx, mTop, 0.42, mTop + bandH).busy },
        { a: "top-center" as CopyAnchor, busy: stat(0.29, mTop, 0.71, mTop + bandH).busy },
        { a: "top-right" as CopyAnchor, busy: stat(0.58, mTop, 1 - mx, mTop + bandH).busy },
      ].sort((x, y) => x.busy - y.busy);
      anchor = cols[0].a;
    }

    // Legibility: a bright calm region wants dark type; a dark one wants light type.
    const ink: ShotPlacement["ink"] = best.lum > 0.62 ? "dark" : best.lum < 0.42 ? "light" : undefined;
    return { layout, ...(anchor ? { anchor } : {}), ...(ink ? { ink } : {}) };
  } catch {
    return null;
  }
}
