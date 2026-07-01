import PptxGenJS from "pptxgenjs";
import { theme, type GuidelinesSpec } from "./backbrain";

/**
 * Build an editable, art-directed .pptx (opens natively in Keynote / PowerPoint / Slides).
 * Design system: the brand's OWN display + sans fonts, the brand's OWN palette used boldly
 * (coloured cover, numbered section dividers, accent rules), a running footer with page
 * numbers, and the full guidelines content — structured into clear numbered sections.
 */

// 16:9 inches
const W = 13.333, H = 7.5, ML = 0.92, CW = W - ML * 2;

const hex = (c = "") => c.replace("#", "").slice(0, 6).padEnd(6, "0").toUpperCase();
function mix(a: string, b: string, t: number) {
  const pa = hex(a), pb = hex(b);
  const ch = (i: number) => Math.round(parseInt(pa.slice(i, i + 2), 16) * (1 - t) + parseInt(pb.slice(i, i + 2), 16) * t);
  return [ch(0), ch(2), ch(4)].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const lum = (h: string) => {
  const c = hex(h);
  return (0.2126 * parseInt(c.slice(0, 2), 16) + 0.7152 * parseInt(c.slice(2, 4), 16) + 0.0722 * parseInt(c.slice(4, 6), 16)) / 255;
};
const txt = (v?: string | string[]) => (Array.isArray(v) ? v : [v]).filter(Boolean).map((s) => String(s)).join("\n\n");

export async function buildPptx(spec: GuidelinesSpec): Promise<string> {
  const t = theme(spec);
  const ink = hex(t.dark);        // brand dark — text on light, ground on dark slides
  const paper = hex(t.light);     // brand light — page background
  const accent = hex(t.gold);     // brand accent — labels, rules, numerals
  const onDark = hex(t.inkOnDark);
  const mutedL = mix(ink, paper, 0.46);
  const hair = mix(ink, paper, 0.82);
  // legible ink for an arbitrary brand-colour background
  const inkOn = (bg: string) => (lum(bg) < 0.55 ? hex(t.inkOnDark) : ink);

  // The brand's OWN fonts (Google families) — fall back to elegant system equivalents.
  const DISPLAY = spec.typography.displayFont?.trim() || "Bodoni Moda";
  const SANS = spec.typography.sansFont?.trim() || "Jost";

  // Distinct, saturated-enough brand colours to drive section dividers (skip near-white).
  const palHexes = (spec.color.palette ?? []).map((p) => hex(p.hex)).filter((h) => /^[0-9A-F]{6}$/.test(h));
  const dividerColors = (palHexes.filter((h) => lum(h) < 0.82).length ? palHexes.filter((h) => lum(h) < 0.82) : [ink, accent, mix(ink, accent, 0.5)]);

  const p = new PptxGenJS();
  p.defineLayout({ name: "W", width: W, height: H });
  p.layout = "W";

  type Opt = Record<string, unknown>;
  let pageNo = 0;
  let section = "";

  // A content slide carries a running footer: brand · section · page.
  const newSlide = (bg: string, footer = true) => {
    const s = p.addSlide();
    s.background = { color: bg };
    if (footer) {
      pageNo += 1;
      const onLight = lum(bg) > 0.55;
      const fc = onLight ? mutedL : mix(onDark, bg, 0.35);
      s.addText((spec.brandName || "Brand").toUpperCase(), { x: ML, y: 7.02, w: 4, h: 0.3, fontFace: SANS, fontSize: 8, color: fc, charSpacing: 2, align: "left" });
      if (section) s.addText(section.toUpperCase(), { x: W / 2 - 3, y: 7.02, w: 6, h: 0.3, fontFace: SANS, fontSize: 8, color: fc, charSpacing: 2, align: "center" });
      s.addText(String(pageNo).padStart(2, "0"), { x: W - ML - 4, y: 7.02, w: 4, h: 0.3, fontFace: SANS, fontSize: 8, color: fc, charSpacing: 2, align: "right" });
    }
    return s;
  };
  const eyebrow = (s: any, label: string, color = accent) =>
    s.addText((label || "").toUpperCase(), { x: ML, y: 0.74, w: CW, h: 0.3, fontFace: SANS, fontSize: 11, bold: true, color, charSpacing: 3, align: "left" });
  const rule = (s: any, x: number, y: number, w: number, color = accent, h = 0.028) =>
    s.addShape(p.ShapeType.rect, { x, y, w, h, fill: { color }, line: { type: "none" } });
  const paraRuns = (paras: string[], color: string, opt: Opt = {}) =>
    paras.filter(Boolean).map((s) => ({ text: String(s), options: { color, breakLine: true, paraSpaceAfter: 10, ...opt } }));

  // ── templates ────────────────────────────────────────────────────────────────
  // Cover — brand-dark ground, big Didone name, accent rule, monogram corner.
  function cover() {
    const s = newSlide(ink, false);
    if (spec.monogram) s.addText(spec.monogram.toUpperCase(), { x: ML, y: 0.7, w: 2, h: 0.6, fontFace: DISPLAY, fontSize: 26, color: accent, charSpacing: 2 });
    s.addText("BRAND GUIDELINES", { x: ML, y: 0.78, w: CW, h: 0.3, fontFace: SANS, fontSize: 10, bold: true, color: mix(onDark, ink, 0.4), charSpacing: 4, align: "right" });
    s.addText(spec.brandName || "Brand", { x: 0.6, y: 2.5, w: W - 1.2, h: 1.7, fontFace: DISPLAY, fontSize: 64, color: onDark, align: "center", valign: "middle", charSpacing: 1 });
    rule(s, W / 2 - 0.6, 4.42, 1.2, accent, 0.035);
    if (spec.tagline) s.addText(spec.tagline, { x: 1.5, y: 4.65, w: W - 3, h: 0.6, fontFace: SANS, fontSize: 16, italic: true, color: mix(onDark, ink, 0.2), align: "center" });
    s.addText("IDENTITY SYSTEM", { x: 0, y: 6.75, w: W, h: 0.3, fontFace: SANS, fontSize: 9, bold: true, color: accent, charSpacing: 4, align: "center" });
  }

  // Contents — the numbered sections in this deck.
  function contents(items: string[]) {
    const s = newSlide(paper);
    eyebrow(s, "Contents");
    s.addText("Contents", { x: ML, y: 1.1, w: CW, h: 0.9, fontFace: DISPLAY, fontSize: 36, color: ink });
    const runs: any[] = [];
    items.forEach((it, i) => {
      runs.push({ text: `${String(i + 1).padStart(2, "0")}   `, options: { color: accent, fontFace: DISPLAY, fontSize: 18, bold: true, breakLine: false } });
      runs.push({ text: it, options: { color: ink, fontFace: SANS, fontSize: 18, breakLine: true, paraSpaceAfter: 16 } });
    });
    s.addText(runs, { x: ML, y: 2.4, w: CW * 0.8, h: 4.2, valign: "top", lineSpacingMultiple: 1.1 });
  }

  // Section divider — a full-bleed brand-colour slide with a huge numeral + title.
  let sectionNo = 0;
  function divider(title: string, blurb = "") {
    sectionNo += 1;
    section = title;
    const bg = dividerColors[(sectionNo - 1) % dividerColors.length];
    const fg = inkOn(bg);
    const s = newSlide(bg, false);
    s.addText(String(sectionNo).padStart(2, "0"), { x: ML, y: 1.1, w: 6, h: 3.2, fontFace: DISPLAY, fontSize: 180, color: fg, charSpacing: 0 });
    rule(s, ML + 0.06, 5.0, 1.0, fg, 0.04);
    s.addText(title, { x: ML, y: 5.15, w: CW, h: 1.0, fontFace: DISPLAY, fontSize: 44, color: fg, charSpacing: 1 });
    if (blurb) s.addText(blurb, { x: ML, y: 6.1, w: CW * 0.7, h: 0.7, fontFace: SANS, fontSize: 14, italic: true, color: mix(fg, bg, 0.25) });
  }

  function statement(label: string, body: string, dark = false) {
    if (!body) return;
    const s = newSlide(dark ? ink : paper);
    eyebrow(s, label, accent);
    s.addText(body, { x: ML, y: 1.7, w: CW, h: 4.2, fontFace: DISPLAY, fontSize: 32, color: dark ? onDark : ink, align: "left", valign: "middle", lineSpacingMultiple: 1.12 });
  }

  function centered(label: string, paras: string[], dark = true) {
    const body = (paras || []).filter(Boolean);
    if (!body.length) return;
    const s = newSlide(dark ? ink : paper);
    if (label) s.addText(label.toUpperCase(), { x: 0, y: 0.9, w: W, h: 0.3, fontFace: SANS, fontSize: 11, bold: true, color: accent, charSpacing: 3, align: "center" });
    s.addText(paraRuns(body, dark ? onDark : ink, { align: "center", fontSize: 23, paraSpaceAfter: 14 }) as any,
      { x: 1.4, y: 1.2, w: W - 2.8, h: 4.9, fontFace: DISPLAY, align: "center", valign: "middle", lineSpacingMultiple: 1.15 });
  }

  function bodySlide(label: string, title: string, paras: string[]) {
    const body = (paras || []).filter(Boolean);
    if (!title && !body.length) return;
    const s = newSlide(paper);
    eyebrow(s, label);
    if (title) s.addText(title, { x: ML, y: 1.15, w: CW, h: 1.1, fontFace: DISPLAY, fontSize: 30, color: ink, valign: "top", lineSpacingMultiple: 1.05 });
    if (body.length) s.addText(paraRuns(body, mutedL) as any, { x: ML, y: title ? 2.5 : 1.7, w: CW * 0.72, h: 3.9, fontFace: SANS, fontSize: 15.5, valign: "top", lineSpacingMultiple: 1.25 });
  }

  function listSlide(label: string, title: string, items: string[], cross = false) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    const s = newSlide(paper);
    eyebrow(s, label, cross ? "B4453A" : accent);
    if (title) s.addText(title, { x: ML, y: 1.15, w: CW, h: 0.8, fontFace: DISPLAY, fontSize: 28, color: ink });
    const runs: any[] = [];
    list.forEach((it) => {
      runs.push({ text: cross ? "✕  " : "—  ", options: { color: cross ? "B4453A" : accent, bold: true, breakLine: false } });
      runs.push({ text: it, options: { color: mutedL, breakLine: true, paraSpaceAfter: 12 } });
    });
    s.addText(runs, { x: ML, y: 2.35, w: CW * 0.82, h: 4.1, fontFace: SANS, fontSize: 15.5, valign: "top", lineSpacingMultiple: 1.2 });
  }

  function rowsSlide(label: string, title: string, rows: { title?: string; sub?: string; body?: string }[]) {
    const rs = (rows || []).filter((r) => r && (r.title || r.body)).slice(0, 4);
    if (!rs.length) return;
    const s = newSlide(paper);
    eyebrow(s, label);
    if (title) s.addText(title, { x: ML, y: 1.1, w: CW, h: 0.7, fontFace: DISPLAY, fontSize: 26, color: ink });
    const top = 2.25, gap = Math.min(1.2, (H - top - 0.9) / rs.length);
    rs.forEach((r, i) => {
      const y = top + i * gap;
      rule(s, ML, y + 0.06, 0.34, accent, 0.03);
      if (r.title) s.addText(r.title, { x: ML + 0.5, y, w: 3.2, h: 0.45, fontFace: DISPLAY, fontSize: 18, color: ink });
      if (r.sub) s.addText(r.sub.toUpperCase(), { x: ML + 0.5, y: y + 0.42, w: 3.2, h: 0.3, fontFace: SANS, fontSize: 10, bold: true, color: accent, charSpacing: 2 });
      if (r.body) s.addText(r.body, { x: ML + 4.1, y, w: CW - 4.1, h: gap - 0.1, fontFace: SANS, fontSize: 14, color: mutedL, valign: "top", lineSpacingMultiple: 1.2 });
    });
  }

  // Palette — swatches with name, hex AND the brand's meaning for each colour.
  function paletteSlide(pal: { name: string; hex: string; role?: string; meaning?: string }[]) {
    const sw = (pal || []).filter((c) => c && c.hex).slice(0, 6);
    if (!sw.length) return;
    const s = newSlide(paper);
    eyebrow(s, "Colour · Palette");
    s.addText("Colour Palette", { x: ML, y: 1.15, w: CW, h: 0.8, fontFace: DISPLAY, fontSize: 28, color: ink });
    const n = sw.length, gap = 0.4, size = Math.min(1.85, (CW - gap * (n - 1)) / n);
    const totalW = size * n + gap * (n - 1), startX = ML + (CW - totalW) / 2, y = 2.7;
    sw.forEach((c, i) => {
      const x = startX + i * (size + gap);
      s.addShape(p.ShapeType.rect, { x, y, w: size, h: size, fill: { color: hex(c.hex) }, line: { color: hair, width: 0.5 } });
      s.addText(c.name || "", { x: x - 0.2, y: y + size + 0.12, w: size + 0.4, h: 0.3, fontFace: SANS, fontSize: 11, bold: true, color: ink, align: "center" });
      s.addText("#" + hex(c.hex), { x: x - 0.2, y: y + size + 0.4, w: size + 0.4, h: 0.26, fontFace: SANS, fontSize: 9, color: mutedL, align: "center", charSpacing: 1 });
      if (c.role) s.addText(c.role.toUpperCase(), { x: x - 0.2, y: y + size + 0.66, w: size + 0.4, h: 0.24, fontFace: SANS, fontSize: 8, bold: true, color: accent, align: "center", charSpacing: 1 });
    });
    // the meaning line for the first few, beneath, as a legend
    const meanings = sw.filter((c) => c.meaning).slice(0, 3);
    if (meanings.length) {
      const runs = meanings.flatMap((c) => [
        { text: `${c.name}  `, options: { color: ink, bold: true, breakLine: false } },
        { text: `${c.meaning}`, options: { color: mutedL, breakLine: true, paraSpaceAfter: 6 } },
      ]);
      s.addText(runs as any, { x: ML, y: 5.75, w: CW, h: 1.1, fontFace: SANS, fontSize: 11.5, valign: "top", lineSpacingMultiple: 1.15 });
    }
  }

  // Typography specimen — the brand's actual display + sans fonts, big.
  function fontsSlide() {
    const f = spec.typography.fonts || [];
    const s = newSlide(paper);
    eyebrow(s, "Typography · Brand Fonts");
    s.addText("Brand Fonts", { x: ML, y: 1.15, w: CW, h: 0.8, fontFace: DISPLAY, fontSize: 28, color: ink });
    const cols = [
      { face: DISPLAY, label: f[0]?.name || DISPLAY, role: f[0]?.role || "Display", note: f[0]?.note || "" },
      { face: SANS, label: f[1]?.name || SANS, role: f[1]?.role || "Text", note: f[1]?.note || "" },
    ];
    cols.forEach((c, i) => {
      const x = ML + i * (CW / 2);
      s.addText(c.label, { x, y: 2.4, w: CW / 2 - 0.4, h: 0.4, fontFace: SANS, fontSize: 13, bold: true, color: ink, charSpacing: 1 });
      s.addText("Aa", { x, y: 2.8, w: CW / 2 - 0.4, h: 1.7, fontFace: c.face, fontSize: 96, color: ink });
      s.addText("ABCDEFG · abcdefg · 1234567890", { x, y: 4.55, w: CW / 2 - 0.4, h: 0.4, fontFace: c.face, fontSize: 16, color: mutedL });
      s.addText((c.role || "").toUpperCase(), { x, y: 5.0, w: CW / 2 - 0.4, h: 0.3, fontFace: SANS, fontSize: 10, bold: true, color: accent, charSpacing: 2 });
      if (c.note) s.addText(c.note, { x, y: 5.32, w: CW / 2 - 0.5, h: 0.8, fontFace: SANS, fontSize: 12, color: mutedL, lineSpacingMultiple: 1.2 });
    });
  }

  // Type scale — show the actual sizes as a specimen ramp.
  function typeScaleSlide(scale: { name: string; spec?: string; use?: string }[]) {
    const sc = (scale || []).filter((x) => x && x.name).slice(0, 4);
    if (!sc.length) return;
    const s = newSlide(paper);
    eyebrow(s, "Typography · Scale");
    const sizes = [40, 30, 22, 16];
    const top = 1.5, gap = 1.3;
    sc.forEach((x, i) => {
      const y = top + i * gap;
      s.addText(spec.brandName || "Brand", { x: ML, y, w: CW * 0.5, h: gap - 0.2, fontFace: DISPLAY, fontSize: sizes[i] ?? 16, color: ink, valign: "middle" });
      s.addText(x.name, { x: ML + CW * 0.52, y, w: CW * 0.12, h: 0.4, fontFace: SANS, fontSize: 11, bold: true, color: accent, charSpacing: 1, valign: "middle" });
      s.addText([x.spec, x.use].filter(Boolean).join("  ·  "), { x: ML + CW * 0.52, y: y + 0.32, w: CW * 0.48, h: gap - 0.4, fontFace: SANS, fontSize: 12, color: mutedL, valign: "top", lineSpacingMultiple: 1.2 });
    });
  }

  // ── compose ──────────────────────────────────────────────────────────────────
  cover();

  // Decide which sections exist, build the contents list, then emit divider + slides.
  const has = {
    foundation: !!(spec.mission || spec.vision || spec.positioning || spec.purpose || spec.manifesto.length || spec.world.length || spec.beliefs.length || spec.statement.length),
    logo: !!(spec.logo.concept.length || spec.logo.variations.length || spec.logo.safety.length || spec.logo.donts.length),
    colour: !!(spec.color.philosophy.length || spec.color.palette.length || spec.color.hierarchy.length),
    type: !!(spec.typography.philosophy.length || spec.typography.fonts.length || spec.typography.scale.length || spec.typography.rules.length),
    imagery: !!(spec.photography.philosophy.length || spec.photography.inUse.length || spec.patternSystem.length || spec.patternStory?.title || spec.heroStory?.title || spec.waxSeal?.concept?.length),
    application: !!spec.applications.length,
  };
  const sections = [
    has.foundation && "Foundation",
    has.logo && "Logo",
    has.colour && "Colour",
    has.type && "Typography",
    has.imagery && "Imagery & Motifs",
    has.application && "Application",
  ].filter(Boolean) as string[];
  contents(sections);

  if (has.foundation) {
    divider("Foundation", "Who we are, what we believe, and why it matters.");
    statement("Mission", spec.mission);
    statement("Vision", spec.vision);
    statement("Positioning", spec.positioning);
    if (spec.purpose) statement("Purpose", spec.purpose);
    centered("", spec.manifesto, true);
    bodySlide("Identity Principles", "Identity Principles", spec.identityIntro);
    rowsSlide("The Brand", `The ${spec.brandName} World`, spec.world);
    centered("The Statement", spec.statement, true);
    rowsSlide("What We Believe", "What We Believe", spec.beliefs);
    if (spec.quotes?.[0]) centered("", [spec.quotes[0]], true);
  }

  if (has.logo) {
    divider("Logo", "The mark, its colourways, and how to protect it.");
    bodySlide("Logo · The Idea", "Logo", spec.logo.concept);
    if (spec.logo.colorNote) bodySlide("Logo · Colour", "Logo Colour", [spec.logo.colorNote]);
    if (spec.logo.variations?.length) listSlide("Logo · Variations", "Logo Variations", spec.logo.variations.map((v) => `${v.name}${v.use ? " — " + v.use : ""}`));
    listSlide("Logo · Safe Space", "Logo Safety", spec.logo.safety);
    listSlide("Logo · Don'ts", "Logo Don'ts", spec.logo.donts, true);
  }

  if (has.colour) {
    divider("Colour", "The palette, its meaning, and how it is balanced.");
    bodySlide("Colour · Philosophy", "Colour Philosophy", spec.color.philosophy);
    paletteSlide(spec.color.palette);
    rowsSlide("Colour · Hierarchy", "Colour Hierarchy", spec.color.hierarchy);
  }

  if (has.type) {
    divider("Typography", "The voice of the brand in letterform.");
    bodySlide("Typography", "Typography", spec.typography.philosophy);
    fontsSlide();
    typeScaleSlide(spec.typography.scale);
    listSlide("Typography · Rules", "Type Rules", spec.typography.rules);
  }

  if (has.imagery) {
    divider("Imagery & Motifs", "How the brand looks through a lens — and its signatures.");
    if (spec.patternStory?.title) bodySlide("Pattern", spec.patternStory.title, [spec.patternStory.body]);
    listSlide("Pattern System", "Pattern System", spec.patternSystem);
    bodySlide("Photography", "Photography", spec.photography.philosophy);
    rowsSlide("Photography · In Use", "Photography in Use", spec.photography.inUse);
    if (spec.heroStory?.title) statement(spec.heroStory.title, txt(spec.heroStory.body));
    if (spec.waxSeal?.concept?.length) bodySlide("The Wax Seal", "The Wax Seal", spec.waxSeal.concept);
  }

  if (has.application) {
    divider("Application", "The system, brought to life.");
    listSlide("Applications", "Applications", spec.applications.map((a) => a.label));
  }

  if (spec.intentIntro?.length) centered("The Intent Behind the Design", spec.intentIntro, true);
  centered("The Intent Behind Everything", spec.intent, true);

  return (await p.write({ outputType: "base64" })) as string;
}
