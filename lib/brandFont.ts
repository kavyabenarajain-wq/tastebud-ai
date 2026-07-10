/**
 * Brand typography → a real, loadable webfont.
 *
 * The brain stores typography as a DESCRIPTION ("a warm humanist serif") or a named
 * commercial face ("GT Sectra", "Canela") — never a font file. To render copy in the
 * brand's own type (on the live canvas AND baked into exports) we resolve that
 * description to the NEAREST free Google Font: automatic, license-clean, always
 * renders in-brand-feeling type. One resolver, two consumers:
 *   • client  → `googleFontHref()` injects the <link>, `fontVars()` sets CSS vars
 *   • server  → `loadFontData()` fetches the TTF buffer satori needs to bake glyphs
 */

export interface ResolvedFont {
  family: string;      // Google Font family, e.g. "Fraunces"
  category: "serif" | "sans" | "slab" | "mono" | "display" | "script";
  cssStack: string;    // full CSS font-family stack with sensible fallbacks
  weight: number;      // the weight to render at
  tracking: string;    // letter-spacing that suits the face
}

export interface BrandFonts { display: ResolvedFont; text: ResolvedFont }

const FALLBACK: Record<ResolvedFont["category"], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  slab: "Georgia, serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  display: "Georgia, serif",
  script: "'Segoe Script', cursive",
};

/** Named commercial faces → their closest Google equivalent. Checked first (exact-ish). */
const NAMED: Array<[RegExp, string, ResolvedFont["category"]]> = [
  [/recoleta|sectra|canela|tiempos|freight/i, "Fraunces", "serif"],
  [/garamond|sabon|minion|cormorant/i, "Cormorant Garamond", "serif"],
  [/didot|bodoni|didone/i, "Playfair Display", "display"],
  [/times|georgia|caslon|baskerville|plantin/i, "PT Serif", "serif"],
  [/tiempos text|lyon|newsreader|source serif/i, "Newsreader", "serif"],
  [/circular|futura|avenir|jost|century gothic/i, "Jost", "sans"],
  [/gotham|montserrat|proxima/i, "Montserrat", "sans"],
  [/poppins|geometric|sofia|dm sans/i, "Poppins", "sans"],
  [/helvetica|neue haas|aktiv|söhne|sohne|gt america|inter|arial|graphik|founders/i, "Inter", "sans"],
  [/gt walsheim|walsheim|cera|greycliff/i, "Mulish", "sans"],
  [/space grotesk|grotesk|grotesque|neue montreal|pp neue/i, "Space Grotesk", "sans"],
  [/oswald|bebas|condensed|narrow|anton/i, "Oswald", "display"],
  [/roboto slab|slab|rockwell|courier slab/i, "Roboto Slab", "slab"],
  [/mono|courier|jetbrains|ibm plex mono/i, "Space Mono", "mono"],
  [/caveat|handwritten|handwriting|script|cursive|marker/i, "Caveat", "script"],
  [/quicksand|rounded|nunito|comfortaa/i, "Quicksand", "sans"],
];

/** Descriptive keywords → nearest Google Font. The general classifier. */
const BY_FEEL: Array<[RegExp, string, ResolvedFont["category"]]> = [
  [/editorial|fashion|luxe|luxury|elegant|high.?contrast|refined|couture/i, "Fraunces", "serif"],
  [/humanist serif|warm serif|organic serif|contemporary serif/i, "Fraunces", "serif"],
  [/classic serif|traditional serif|transitional/i, "Lora", "serif"],
  [/display serif|dramatic|statement/i, "Playfair Display", "display"],
  [/slab/i, "Roboto Slab", "slab"],
  [/\bserif\b/i, "Lora", "serif"],
  [/geometric|modern sans|clean sans|minimal sans|technical/i, "Poppins", "sans"],
  [/grotesk|grotesque|neutral|swiss|helvetica.?like/i, "Space Grotesk", "sans"],
  [/humanist sans|friendly|approachable|warm sans/i, "Work Sans", "sans"],
  [/condensed|narrow|tall|impact|bold display/i, "Oswald", "display"],
  [/rounded|soft|playful|bubbly/i, "Quicksand", "sans"],
  [/mono|monospace|code|utilitarian/i, "Space Mono", "mono"],
  [/hand|script|signature|brush|casual/i, "Caveat", "script"],
  [/\bsans\b|sans.?serif/i, "Work Sans", "sans"],
];

/** Build a ResolvedFont from an explicit family + category (used by the font catalog). */
export function makeFont(family: string, category: ResolvedFont["category"], weight: number, tracking: string): ResolvedFont {
  return { family, category, weight, tracking, cssStack: `'${family}', ${FALLBACK[category]}` };
}

function resolveOne(desc: string | undefined, role: "display" | "text"): ResolvedFont {
  const d = (desc ?? "").trim();
  let family = "";
  let category: ResolvedFont["category"] = role === "display" ? "serif" : "sans";

  for (const [re, fam, cat] of NAMED) if (re.test(d)) { family = fam; category = cat; break; }
  if (!family) for (const [re, fam, cat] of BY_FEEL) if (re.test(d)) { family = fam; category = cat; break; }
  if (!family) {
    // Nothing matched: a tasteful editorial default — serif display, humanist text.
    family = role === "display" ? "Fraunces" : "Work Sans";
    category = role === "display" ? "serif" : "sans";
  }

  const weight = role === "display" ? (category === "display" ? 600 : 600) : 450;
  const tracking = category === "display" || category === "serif" ? "-0.02em" : "0em";
  return { family, category, weight, tracking, cssStack: `'${family}', ${FALLBACK[category]}` };
}

/** The single entry point: brand typography → a display + text webfont pair. */
export function resolveBrandFonts(typography?: { display?: string; text?: string; note?: string } | null): BrandFonts {
  const display = resolveOne(typography?.display || typography?.note, "display");
  const text = resolveOne(typography?.text || typography?.display, "text");
  return { display, text };
}

/** The Google Fonts stylesheet URL that loads both faces (client-side <link>). */
export function googleFontHref(fonts: BrandFonts): string {
  const fams = new Map<string, Set<number>>();
  for (const f of [fonts.display, fonts.text]) {
    const set = fams.get(f.family) ?? new Set<number>();
    set.add(f.weight);
    // Load the full weight ladder the copy overlay can render (headline 600/700, subline
    // 400, CTA 500) so the live preview matches what the export bakes — a bold headline or
    // medium CTA must not silently fall back to a wrong weight in the browser.
    for (const w of [400, 500, 600, 700]) set.add(w);
    fams.set(f.family, set);
  }
  const parts = [...fams.entries()].map(
    ([fam, ws]) => `family=${encodeURIComponent(fam)}:wght@${[...ws].sort((a, b) => a - b).join(";")}`,
  );
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/** CSS custom properties to hang on the canvas root so overlays can use the brand type. */
export function fontVars(fonts: BrandFonts): Record<string, string> {
  return {
    "--brand-display": fonts.display.cssStack,
    "--brand-display-tracking": fonts.display.tracking,
    "--brand-text": fonts.text.cssStack,
    "--brand-text-tracking": fonts.text.tracking,
  };
}

// ── Server: real TTF bytes for satori (glyphs are baked to vector paths, so the
// rasteriser needs no installed fonts). Cached per family+weight for the process. ──
const ttfCache = new Map<string, ArrayBuffer>();

// A UA with no AppleWebKit token, so the Google Fonts CSS API serves TrueType rather
// than woff2 (satori supports ttf/otf/woff, never woff2). Verified 2026-07-04.
const TTF_UA = "Mozilla/5.0 (Windows NT 6.1)";

export async function loadFontData(family: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${family}@${weight}`;
  const hit = ttfCache.get(key);
  if (hit) return hit;
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
    const css = await (await fetch(cssUrl, { headers: { "User-Agent": TTF_UA } })).text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(?:truetype|opentype)['"]?\)/i)
      || css.match(/url\((https:\/\/[^)]+\.(?:ttf|otf))\)/i);
    if (!m) return null;
    const buf = await (await fetch(m[1])).arrayBuffer();
    ttfCache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}
