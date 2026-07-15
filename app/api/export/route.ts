import { NextRequest, NextResponse } from "next/server";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { toDataUri, persistBuffer } from "@/lib/image";
import { loadFontData } from "@/lib/brandFont";
import { buildCopyLayout, type LayoutBlock, type LayoutCluster } from "@/lib/copyLayout";
import type { CampaignCopy } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface FontSpec { family: string; weight: number }
interface Body {
  src: string;
  aspect?: number;
  copy?: CampaignCopy;
  fonts?: { display?: FontSpec; text?: FontSpec };
  brand?: string;
}

// A satori node built by hand (this is a .ts route, so no JSX). `h` mirrors createElement.
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});

export async function POST(req: NextRequest) {
  try {
    const { src, copy, fonts, aspect }: Body = await req.json();
    if (!src) return NextResponse.json({ error: "no src" }, { status: 400 });

    // Base plate → bytes + true pixel size.
    const dataUri = await toDataUri(src);
    const baseBuf = Buffer.from(dataUri.split(",")[1] ?? "", "base64");
    const meta = await sharp(baseBuf).metadata();
    const W = meta.width ?? 1080;
    const H = meta.height ?? 1350;

    // Resolve copy + treatment into free-placement clusters. The SAME spec drives the live
    // canvas preview (ShotCard), so what the user sees is exactly what bakes here.
    const spec = buildCopyLayout({ copy: copy ?? {}, treatment: copy?.treatment, aspect: aspect && aspect > 0 ? aspect : W / H });
    if (!spec) return NextResponse.json({ url: src }); // nothing to bake — hand the plate back

    // Fonts satori needs (glyphs are baked to vector paths → no fonts required at raster
    // time). Load the brand faces plus the weights the layout uses (headline 600/700,
    // subline 400, CTA 500) so a bold/solid treatment never falls back to a wrong weight.
    const displaySpec = fonts?.display ?? { family: "Fraunces", weight: 600 };
    const textSpec = fonts?.text ?? { family: "Work Sans", weight: 450 };
    const wanted: Array<{ name: string; weight: number }> = [
      { name: displaySpec.family, weight: displaySpec.weight },
      { name: displaySpec.family, weight: 600 },
      { name: displaySpec.family, weight: 700 },
      { name: textSpec.family, weight: 400 },
      { name: textSpec.family, weight: textSpec.weight },
      { name: textSpec.family, weight: 500 },
    ].filter((w, i, a) => a.findIndex((x) => x.name === w.name && x.weight === w.weight) === i);
    const loaded = await Promise.all(wanted.map((w) => loadFontData(w.name, w.weight).then((data) => (data ? { ...w, data } : null))));
    const satoriFonts = loaded.filter(Boolean) as Array<{ name: string; weight: number; data: ArrayBuffer }>;
    // Universal glyph fallback, appended LAST so the brand faces still win for every glyph
    // they own — satori only reaches for this when a face LACKS a glyph. Many brand faces
    // omit symbols/punctuation (the text-link arrow →, smart quotes, accents), and satori has
    // NO implicit system fallback, so a missing glyph would bake as a .notdef tofu box while
    // the browser preview substitutes one via its CSS stack. Inter carries them → export
    // matches preview, and it also covers the offline case where no brand face loaded.
    const fallbackInter = await loadFontData("Inter", 400);
    if (fallbackInter && !satoriFonts.some((f) => f.name === "Inter" && f.weight === 400)) satoriFonts.push({ name: "Inter", weight: 400, data: fallbackInter });
    if (!satoriFonts.length) return NextResponse.json({ url: src }); // offline — no baking possible

    const shadow = spec.textShadow; // resolved once in copyLayout — "none" over a brand-colour fill

    // One block → one satori div. fontPct is a % of WIDTH so px here and cqw in the preview
    // scale identically; letter-spacing (em) converts against the resolved pixel size.
    const blockNode = (b: LayoutBlock, align: LayoutCluster["align"], first: boolean): Node => {
      const fs = Math.max(1, Math.round((b.fontPct / 100) * W));
      const ls = `${(b.tracking * fs).toFixed(2)}px`;
      const cast = b.transform === "upper" ? b.text.toUpperCase() : b.transform === "lower" ? b.text.toLowerCase() : b.text;
      const textAlign = align;
      const gapTop = first ? 0 : Math.round((b.role === "cta" ? 0.028 : 0.011) * W);
      if (b.role === "cta") {
        const label = b.arrow ? `${cast} →` : cast;
        const base: Record<string, unknown> = { display: "flex", marginTop: gapTop, fontFamily: textSpec.family, fontWeight: b.weight, fontSize: fs, letterSpacing: ls, lineHeight: b.lineHeight };
        if (b.pill) return h("div", { ...base, background: spec.pillBg, color: spec.pillInk, borderRadius: 999, paddingLeft: Math.round(0.02 * W), paddingRight: Math.round(0.02 * W), paddingTop: Math.round(0.009 * W), paddingBottom: Math.round(0.009 * W) }, label);
        if (b.outline) return h("div", { ...base, color: spec.ink, border: `${Math.max(2, Math.round(0.0022 * W))}px solid ${spec.ink}`, borderRadius: 999, paddingLeft: Math.round(0.02 * W), paddingRight: Math.round(0.02 * W), paddingTop: Math.round(0.009 * W), paddingBottom: Math.round(0.009 * W) }, label);
        return h("div", { ...base, color: spec.ink, textDecoration: b.underline ? "underline" : "none", textShadow: shadow }, label);
      }
      const fam = b.family === "display" ? displaySpec.family : textSpec.family;
      // width:100% (definite) is what makes satori wrap the text AND measure its multi-line
      // height correctly — without it, a wrapped headline collapses and the next block
      // overlaps it (and diverges from the CSS preview, which wraps correctly).
      return h(
        "div",
        { width: "100%", marginTop: gapTop, fontFamily: fam, fontWeight: b.weight, fontSize: fs, letterSpacing: ls, lineHeight: b.lineHeight, color: b.family === "display" ? spec.ink : spec.subInk, textAlign, textShadow: shadow, wordBreak: "break-word" },
        cast,
      );
    };

    const clusterNode = (c: LayoutCluster): Node => {
      const alignItems = c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start";
      const style: Record<string, unknown> = {
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        alignItems,
        // Explicit width (not maxWidth) so text blocks resolve a definite wrap width. Yoga is
        // border-box (matches the browser's Tailwind reset) so panel padding sits INSIDE this.
        width: Math.round(c.maxW * W),
      };
      // Brand-colour panel behind the copy (band / block). Padding is a % of frame width, so px
      // here and cqw in the preview scale identically.
      if (c.panel) {
        const pad = (pct: number) => Math.round((pct / 100) * W);
        style.backgroundColor = c.panel.color;
        style.paddingLeft = pad(c.panel.padX);
        style.paddingRight = pad(c.panel.padX);
        style.paddingTop = pad(c.panel.padY);
        style.paddingBottom = pad(c.panel.padY);
        if (c.panel.radius) style.borderRadius = pad(c.panel.radius);
      }
      if (c.ax === "left") style.left = Math.round(c.x * W);
      else if (c.ax === "right") style.right = Math.round((1 - c.x) * W);
      else style.left = Math.round(c.x * W);
      if (c.ay === "top") style.top = Math.round(c.y * H);
      else if (c.ay === "bottom") style.bottom = Math.round((1 - c.y) * H);
      else style.top = Math.round(c.y * H);
      const tx = c.ax === "center" ? "-50%" : "0";
      const ty = c.ay === "center" ? "-50%" : "0";
      if (tx !== "0" || ty !== "0") style.transform = `translate(${tx}, ${ty})`;
      return h("div", style, c.blocks.map((b, i) => blockNode(b, c.align, i === 0)));
    };

    // Root: a "canvas" fill covers the whole plate (poster / text-led); otherwise the photo shows
    // through and the scrim (when present) carries legibility. satori dislikes backgroundImage:"none".
    const rootStyle: Record<string, unknown> = { display: "flex", position: "relative", width: W, height: H };
    if (spec.canvasBg) rootStyle.backgroundColor = spec.canvasBg;
    if (spec.scrim && spec.scrim !== "none") rootStyle.backgroundImage = spec.scrim;
    const root = h("div", rootStyle, spec.clusters.map(clusterNode));

    const svg = await satori(root as unknown as React.ReactNode, {
      width: W,
      height: H,
      fonts: satoriFonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight as 400 | 500 | 600 | 700, style: "normal" as const })),
    });
    const textPng = new Resvg(svg, { fitTo: { mode: "width", value: W }, background: "rgba(0,0,0,0)" }).render().asPng();

    const out = await sharp(baseBuf).composite([{ input: textPng, top: 0, left: 0 }]).png().toBuffer();
    const url = await persistBuffer(`exp-${Date.now().toString(36)}`, out);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "export failed" }, { status: 500 });
  }
}
