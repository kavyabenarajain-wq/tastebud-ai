import type { CampaignCopy, CopyTreatment, CopyLayout as LayoutId, CopyAnchor, PaletteColor, CopyBg } from "./types";

/**
 * Relative luminance (WCAG) of a #rrggbb / #rgb hex — used to pick a readable ink over any
 * brand-palette fill so a colour background never buries the type. Bad/absent hex → mid-grey.
 */
export function hexLuminance(hex?: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return 0.5;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(h.slice(0, 2), 16));
  const g = toLin(parseInt(h.slice(2, 4), 16));
  const b = toLin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black or near-white — whichever reads clearly on the given fill. */
export function readableInk(bg?: string): string {
  return hexLuminance(bg) > 0.5 ? "#141414" : "#ffffff";
}

/** A hex → rgba() string at the given alpha, so a dimmed subline keeps the ink's hue. */
export function hexToRgba(hex: string, a: number): string {
  const h = normHex(hex) ?? "#ffffff";
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

/** A normalised #rrggbb, or null if the string isn't a usable hex. */
export function normHex(hex?: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toLowerCase()}`;
}

/**
 * The brand's default background colour when a colour mode is chosen without an explicit hex —
 * prefer a palette entry whose role reads like a primary/brand/accent tone, else the first
 * usable hex, skipping near-white neutrals so a "band" is never invisibly pale by default.
 */
export function defaultBgColor(palette?: PaletteColor[]): string | null {
  const usable = (palette ?? []).map((c) => ({ hex: normHex(c.hex), role: (c.role ?? c.name ?? "").toLowerCase() })).filter((c): c is { hex: string; role: string } => !!c.hex);
  if (!usable.length) return null;
  const strong = usable.filter((c) => hexLuminance(c.hex) < 0.82); // drop paper-white neutrals
  const pool = strong.length ? strong : usable;
  const primary = pool.find((c) => /primary|brand|hero|main|accent|signature|core/.test(c.role));
  return (primary ?? pool[0]).hex;
}

/**
 * FREE-PLACEMENT COPY LAYOUT — one resolution-independent spec, two renderers.
 *
 * The old system stacked headline → subline → CTA into a single column pinned to one
 * of six anchors (top/center/bottom × left/center) — so campaign type always read as
 * "bottom-left". Real editorial campaigns (see the FYN reference set) put type ANYWHERE
 * and vary it shot to shot: a small refined headline up top, an oversized display block
 * in a corner, a split (headline top / CTA bottom) around the product, a feature column
 * railed down one side, a centered statement.
 *
 * This module turns a brand's copy + its typographic TREATMENT into a set of absolutely
 * positioned CLUSTERS on a normalised 0..1 grid. Both consumers read the SAME spec so the
 * live canvas preview is exactly what the exported PNG bakes:
 *   • server  → satori nodes in px          (app/api/export/route.ts)
 *   • client  → CSS absolute + cqw units    (ShotCard, studio/create)
 *
 * Pure math + strings, no I/O — safe to import from a client component and an API route.
 */

export interface LayoutBlock {
  role: "headline" | "subline" | "cta";
  text: string;
  family: "display" | "text";
  fontPct: number; // font-size as a % of the frame WIDTH (so px and cqw agree)
  weight: number;
  tracking: number; // letter-spacing, em
  lineHeight: number;
  transform: "upper" | "lower" | "none";
  // CTA form
  pill?: boolean;
  outline?: boolean;
  underline?: boolean;
  arrow?: boolean;
}

// A brand-colour rectangle drawn BEHIND a cluster's type — the "colours as the background"
// lever. Applied as the cluster container's own background+padding so the two renderers stay
// pixel-identical (a div with background/padding/radius). `full` widens the cluster to a true
// edge-to-edge band; otherwise it's a tight block hugging the text.
export interface ClusterPanel {
  color: string; // brand-palette hex fill
  padX: number;  // horizontal padding, % of frame WIDTH
  padY: number;  // vertical padding, % of frame WIDTH
  radius: number; // corner radius, % of frame WIDTH
  full?: boolean; // edge-to-edge band vs. tight block
}

export interface LayoutCluster {
  x: number; // 0..1 anchor position (fraction of width)
  y: number; // 0..1 anchor position (fraction of height)
  ax: "left" | "center" | "right"; // which edge x refers to
  ay: "top" | "center" | "bottom"; // which edge y refers to
  align: "left" | "center" | "right"; // text alignment inside the cluster
  maxW: number; // 0..1 fraction of frame width the cluster may occupy
  gap: number; // % of width between stacked blocks
  blocks: LayoutBlock[];
  panel?: ClusterPanel; // brand-colour background behind THIS cluster (band/block modes)
}

export interface CopyLayoutSpec {
  clusters: LayoutCluster[];
  scrim: string; // CSS background-image (legibility gradient) — "none" when a colour fill is used
  ink: string; // headline colour (hex)
  subInk: string; // subline colour (dimmed ink, rgba) — resolved once so both renderers agree
  textShadow: string; // legibility shadow over a photo, "none" over a colour fill
  pillBg: string; // solid-CTA background
  pillInk: string; // solid-CTA text
  vertical: boolean;
  canvasBg?: string; // full-frame brand-colour fill (poster / "canvas" mode) — covers the photo
}

const has = (s?: string): s is string => !!s && !!s.trim();

/** Legacy `placement` (top/center/bottom) → a layout id, when no explicit layout is set. */
function legacyLayout(t: CopyTreatment, vertical: boolean): LayoutId {
  if (t.placement === "top") return "editorial-top";
  if (t.placement === "center") return "center";
  if (t.placement === "bottom") return "lower-third";
  // No direction at all: stories/verticals put the product low-to-centre, so type reads
  // best up top; flatter feed/landscape frames default to the classic lower band.
  return vertical ? "editorial-top" : "lower-third";
}

/** The horizontal column an anchor names ("center" for the plain "center" anchor). */
function anchorCol(anchor: CopyAnchor | undefined): "left" | "center" | "right" | undefined {
  if (!anchor) return undefined;
  if (anchor === "center") return "center";
  const col = anchor.split("-")[1];
  return col === "left" || col === "right" ? col : "center";
}

/** 9-region anchor → grid coordinates within the safe area. */
function anchorGrid(anchor: CopyAnchor | undefined, mx: number, mTop: number, mBot: number): Pick<LayoutCluster, "x" | "y" | "ax" | "ay"> {
  const a = anchor ?? "top-left";
  const [row, col] = a === "center" ? (["center", "center"] as const) : (a.split("-") as [string, string]);
  const x = col === "left" ? mx : col === "right" ? 1 - mx : 0.5;
  const ax = (col === "left" ? "left" : col === "right" ? "right" : "center") as LayoutCluster["ax"];
  const y = row === "top" ? mTop : row === "bottom" ? 1 - mBot : 0.5;
  const ay = (row === "top" ? "top" : row === "bottom" ? "bottom" : "center") as LayoutCluster["ay"];
  return { x, y, ax, ay };
}

const SCALE_PCT: Record<NonNullable<CopyTreatment["scale"]>, number> = {
  minimal: 3.4,
  standard: 4.6,
  impact: 6.2,
  hero: 9.0,
};
const SCALE_ORDER: Array<NonNullable<CopyTreatment["scale"]>> = ["minimal", "standard", "impact", "hero"];

/**
 * Resolve copy + treatment into positioned clusters for a given aspect (width/height).
 * Returns null when there's nothing to lay out.
 */
export function buildCopyLayout(args: { copy: CampaignCopy; treatment?: CopyTreatment; aspect?: number; palette?: PaletteColor[] }): CopyLayoutSpec | null {
  const { copy } = args;
  const headline = has(copy.headline) ? copy.headline!.trim() : "";
  const subline = has(copy.subline) ? copy.subline!.trim() : "";
  const cta = has(copy.cta) ? copy.cta!.trim() : "";
  if (!headline && !cta) return null;

  const t = args.treatment ?? {};
  const aspect = args.aspect && args.aspect > 0 ? args.aspect : 0.8; // width / height
  const vertical = aspect <= 0.62; // 9:16 story / reel — reserve the platform UI bands

  // Safe insets: a tall vertical reserves the top ~15% / bottom ~20% for the story reply
  // & CTA bars and the profile ring; flatter frames only need a small margin off the edges.
  const mx = vertical ? 0.06 : 0.055;
  const mTop = vertical ? 0.15 : 0.07;
  const mBot = vertical ? 0.2 : 0.08;

  const layout: LayoutId = t.layout ?? legacyLayout(t, vertical);
  const align: LayoutCluster["align"] = t.align === "center" ? "center" : t.align === "right" ? "right" : "left";
  const kase = t.case === "upper" ? "upper" : t.case === "lower" ? "lower" : "none";
  const bold = t.weight === "bold";
  const ctaStyle = t.ctaStyle ?? "solid";

  // ── COLOUR RESOLUTION — "use the brand's colours as the background". `bg` chooses whether the
  //    copy rides today's photo scrim or a brand-colour band / block / full canvas. Every colour
  //    is a resolved hex; when the type sits on a brand-colour fill the ink is chosen for contrast
  //    and the CTA pill inverts, so any palette combination stays legible.
  const bgMode: CopyBg = t.bg ?? "scrim";
  const bgColor = bgMode === "scrim" ? null : (normHex(t.bgColor) ?? defaultBgColor(args.palette) ?? "#141414");
  const canvasBg = bgMode === "canvas" ? bgColor ?? undefined : undefined;
  const panelFill = bgMode === "canvas" ? canvasBg ?? null : (bgMode === "band" || bgMode === "block") ? bgColor : null;
  const onColor = !!panelFill; // type sits on a brand-colour fill, not a photo
  const inkLight = t.ink !== "dark"; // default over a photo: light type
  const ink = normHex(t.inkColor) ?? (onColor ? readableInk(panelFill!) : inkLight ? "#ffffff" : "#141414");
  const inkIsLight = hexLuminance(ink) > 0.5;
  const subInk = hexToRgba(ink, onColor ? 0.84 : 0.9);
  const shadow = onColor ? "none" : inkIsLight ? "0 1px 14px rgba(0,0,0,0.38)" : "0 1px 12px rgba(255,255,255,0.42)";
  const pillBg = normHex(t.ctaBgColor) ?? (onColor ? ink : inkLight ? "#ffffff" : "#141414");
  const pillInk = normHex(t.ctaInkColor) ?? (onColor ? panelFill! : inkLight ? "#111111" : "#ffffff");

  // Hierarchy scale. `mega` always commands the frame; `side-rail` can't run hero in a
  // half-width column, so it's capped at impact.
  let scaleKey: NonNullable<CopyTreatment["scale"]> = t.scale ?? "standard";
  if (layout === "mega" && (scaleKey === "minimal" || scaleKey === "standard")) scaleKey = "hero";
  // A hero headline can't run in a half-width rail or a top-anchored split without colliding
  // with the rest of the copy — cap those at impact.
  if ((layout === "side-rail" || layout === "split") && scaleKey === "hero") scaleKey = "impact";
  // Fit guard: a big headline over a narrow column wraps to many lines; estimate the wrapped
  // block height and step the scale DOWN until it fits the layout's vertical budget, so it
  // can never run past its band into the product / the CTA / the opposite safe zone.
  const maxWApprox = layout === "side-rail" ? 0.52 : layout === "center" ? 0.84 : layout === "mega" ? 0.9 : 1 - 2 * mx;
  const heightBudget = layout === "center" ? 0.52 : layout === "side-rail" ? 0.62 : layout === "lower-third" ? 0.42 : layout === "split" ? 0.4 : 0.46;
  while (headline && scaleKey !== "minimal") {
    const hp = SCALE_PCT[scaleKey];
    const lines = Math.max(1, Math.ceil((headline.length * 0.52 * (hp / 100)) / maxWApprox)); // ~0.52em avg glyph advance
    if (lines * (hp / 100) * 1.05 * aspect <= heightBudget) break; // block height as a fraction of frame HEIGHT
    scaleKey = SCALE_ORDER[SCALE_ORDER.indexOf(scaleKey) - 1];
  }
  const hPct = SCALE_PCT[scaleKey];

  const headlineTransform: LayoutBlock["transform"] = kase;
  const headlineTracking = kase === "upper" ? 0.03 : -0.02; // caps breathe, display tightens

  const mkBlocks = (which: { headline?: boolean; subline?: boolean; cta?: boolean }): LayoutBlock[] => {
    const out: LayoutBlock[] = [];
    if (which.headline && headline)
      out.push({ role: "headline", text: headline, family: "display", fontPct: hPct, weight: bold ? 700 : 600, tracking: headlineTracking, lineHeight: 1.05, transform: headlineTransform });
    if (which.subline && subline)
      out.push({ role: "subline", text: subline, family: "text", fontPct: Math.min(2.7, Math.max(2.0, hPct * 0.45)), weight: 400, tracking: 0, lineHeight: 1.3, transform: "none" });
    if (which.cta && cta)
      out.push({
        role: "cta",
        text: cta,
        family: "text",
        fontPct: 2.05,
        weight: 500,
        tracking: ctaStyle === "text-link" ? 0.02 : 0.01,
        lineHeight: 1,
        transform: "none",
        pill: ctaStyle === "solid",
        outline: ctaStyle === "outline",
        underline: ctaStyle === "text-link",
        arrow: ctaStyle === "text-link",
      });
    return out;
  };

  const clusters: LayoutCluster[] = [];
  // Which edge(s) the legibility scrim should darken/lighten from.
  let edges: Array<"top" | "bottom" | "center" | "left" | "right"> = ["bottom"];

  switch (layout) {
    case "editorial-top": {
      // The anchor's column (when given) picks the top corner; otherwise fall back to align.
      const col = anchorCol(t.anchor) ?? (align === "center" ? "center" : align === "right" ? "right" : "left");
      const ax = col;
      const x = ax === "center" ? 0.5 : ax === "right" ? 1 - mx : mx;
      clusters.push({ x, y: mTop, ax, ay: "top", align, maxW: 1 - 2 * mx, gap: 1.0, blocks: mkBlocks({ headline: true, subline: true, cta: true }) });
      edges = ["top"];
      break;
    }
    case "center": {
      clusters.push({ x: 0.5, y: 0.5, ax: "center", ay: "center", align: "center", maxW: 0.84, gap: 1.2, blocks: mkBlocks({ headline: true, subline: true, cta: true }) });
      edges = ["center"];
      break;
    }
    case "mega": {
      const g = anchorGrid(t.anchor ?? "top-left", mx, mTop, mBot);
      // Mega headline wraps wide and dominates; the CTA tucks under it in the same cluster.
      clusters.push({ ...g, align: g.ax === "right" ? "right" : g.ax === "center" ? "center" : "left", maxW: g.ax === "center" ? 0.92 : 0.9, gap: 1.4, blocks: mkBlocks({ headline: true, subline: true, cta: true }) });
      edges = [g.ay === "center" ? "center" : g.ay];
      break;
    }
    case "side-rail": {
      // The anchor's column (when given) picks which side to rail; otherwise align does.
      const col = anchorCol(t.anchor);
      const right = col ? col === "right" : align === "right";
      clusters.push({ x: right ? 1 - mx : mx, y: 0.5, ax: right ? "right" : "left", ay: "center", align: right ? "right" : "left", maxW: 0.52, gap: 1.0, blocks: mkBlocks({ headline: true, subline: true, cta: true }) });
      edges = [right ? "right" : "left"];
      break;
    }
    case "split": {
      const ax = align === "center" ? "center" : align === "right" ? "right" : "left";
      const x = ax === "center" ? 0.5 : ax === "right" ? 1 - mx : mx;
      // Headline breathes up top, CTA anchors the bottom, the product lives in the gap. The
      // scrim only darkens ends that actually carry type (a headline-less split → CTA only).
      const topBlocks = mkBlocks({ headline: true, subline: true });
      const ctaBlocks = mkBlocks({ cta: true });
      const e: typeof edges = [];
      if (topBlocks.length) { clusters.push({ x, y: mTop, ax, ay: "top", align, maxW: 1 - 2 * mx, gap: 1.0, blocks: topBlocks }); e.push("top"); }
      if (ctaBlocks.length) { clusters.push({ x, y: 1 - mBot, ax, ay: "bottom", align, maxW: 1 - 2 * mx, gap: 1.0, blocks: ctaBlocks }); e.push("bottom"); }
      edges = e.length ? e : ["bottom"];
      break;
    }
    case "lower-third":
    default: {
      const ax = align === "center" ? "center" : align === "right" ? "right" : "left";
      const x = ax === "center" ? 0.5 : ax === "right" ? 1 - mx : mx;
      clusters.push({ x, y: 1 - mBot, ax, ay: "bottom", align, maxW: 1 - 2 * mx, gap: 1.0, blocks: mkBlocks({ headline: true, subline: true, cta: true }) });
      edges = ["bottom"];
      break;
    }
  }

  // Drop empty clusters (e.g. a headline-less split).
  const nonEmpty = clusters.filter((c) => c.blocks.length);
  if (!nonEmpty.length) return null;

  // Manual fine-positioning: shift every cluster by the user's nudge (fraction of frame),
  // clamped into the frame. Applied before band-widening so a band still spans edge-to-edge.
  if (t.nudge && (t.nudge.x || t.nudge.y)) {
    const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    for (const c of nonEmpty) { c.x = clamp01(c.x + t.nudge.x); c.y = clamp01(c.y + t.nudge.y); }
  }

  // Brand-colour panels behind the copy (band / block). A band widens its cluster to a true
  // edge-to-edge strip; a block is an inset rounded card at the cluster's own width. Canvas mode
  // fills the whole frame instead (canvasBg) and needs no per-cluster panel.
  if ((bgMode === "band" || bgMode === "block") && bgColor) {
    for (const c of nonEmpty) {
      if (bgMode === "band") { c.x = 0; c.ax = "left"; c.maxW = 1; c.panel = { color: bgColor, padX: mx * 100, padY: 3.4, radius: 0, full: true }; }
      else c.panel = { color: bgColor, padX: 3.6, padY: 3.0, radius: 2.2 };
    }
  }

  // A colour fill supplies its own contrast → no photo scrim; over a photo the scrim direction
  // follows the ACTUAL ink (a custom dark ink over a bright photo still gets a light veil).
  const scrim = bgMode === "scrim" ? scrimFor(edges, inkIsLight, scaleKey) : "none";

  return { clusters: nonEmpty, scrim, ink, subInk, textShadow: shadow, pillBg, pillInk, vertical, canvasBg };
}

/**
 * A single legibility gradient anchored to the edge(s) the type sits against. Kept to ONE
 * background layer on purpose — satori renders a single `background-image` reliably, so the
 * split case (top + bottom) becomes one symmetric vertical gradient rather than two layers.
 */
function scrimFor(edges: Array<"top" | "bottom" | "center" | "left" | "right">, inkLight: boolean, scale: NonNullable<CopyTreatment["scale"]>): string {
  // Light type wants a dark scrim; dark type wants a light one. Minimal/luxury treatments
  // let the photograph breathe with a lighter veil.
  const base = inkLight ? (scale === "minimal" ? 0.5 : 0.72) : 0.55;
  const c = (a: number) => (inkLight ? `rgba(0,0,0,${a.toFixed(2)})` : `rgba(255,255,255,${a.toFixed(2)})`);
  const d = base;
  const m = base * 0.4;
  const uniq = Array.from(new Set(edges));
  // Split: darken BOTH ends, clear middle — one gradient.
  if (uniq.includes("top") && uniq.includes("bottom"))
    return `linear-gradient(to bottom, ${c(d)} 0%, ${c(m)} 16%, ${c(0)} 38%, ${c(0)} 62%, ${c(m)} 84%, ${c(d)} 100%)`;
  switch (uniq[0]) {
    case "top":
      return `linear-gradient(to bottom, ${c(d)} 0%, ${c(m)} 26%, ${c(0)} 50%)`;
    case "left":
      return `linear-gradient(to right, ${c(d)} 0%, ${c(m)} 30%, ${c(0)} 58%)`;
    case "right":
      return `linear-gradient(to left, ${c(d)} 0%, ${c(m)} 30%, ${c(0)} 58%)`;
    case "center":
      return `linear-gradient(to bottom, ${c(0)} 18%, ${c(d * 0.82)} 50%, ${c(0)} 82%)`;
    case "bottom":
    default:
      return `linear-gradient(to top, ${c(d)} 0%, ${c(m)} 26%, ${c(0)} 50%)`;
  }
}
