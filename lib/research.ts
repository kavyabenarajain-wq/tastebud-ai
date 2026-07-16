import { z } from "zod";
import type { BrandBrain, BrandResearch, BrandIntelligence, StudioProduct } from "./types";
import { chatClients, chatComplete } from "./openaiClient";
import { parseLenient } from "./coerce";
import { extractPhotoRules } from "./photoRules";

/**
 * Brand research. Uses Gemini with live Google Search grounding to study the brand
 * (competitors, ambassadors, Instagram look, website, palette, and its full story),
 * harvests the brand's real product catalogue + photography off their own site, then
 * structures everything into a BrandResearch + a rich BrandIntelligence dossier.
 *
 * Every stage reports progress through an optional `onStage` callback so the Asset
 * Studio research screen can narrate what the AI is actually doing, live.
 */

export type StageKey =
  | "website"
  | "catalog"
  | "images"
  | "products" // the harvested product DATA (not just a count) — streamed early so the library fills fast
  | "intelligence";

export interface ResearchOpts {
  onStage?: (key: StageKey, data?: Record<string, unknown>) => void;
}

const ResearchSchema = z.object({
  summary: z.string().default(""),
  essence: z.string().default(""),
  voice: z.string().default(""),
  competitors: z.array(z.string()).default([]),
  ambassadors: z.array(z.string()).default([]),
  instagram: z.string().default(""),
  website: z.string().default(""),
  palette: z.array(z.object({ hex: z.string(), role: z.string().optional() })).default([]),
  aesthetic: z.string().default(""),
  foundReal: z.boolean().default(false),
});

/** The full articulated Brand Brain — structured out of the grounded dossier. */
const IntelligenceSchema = z.object({
  overview: z.string().default(""),
  purpose: z.string().default(""),
  mission: z.string().default(""),
  vision: z.string().default(""),
  story: z.string().default(""),
  values: z.array(z.string()).default([]),
  positioning: z.string().default(""),
  audience: z.string().default(""),
  persona: z.string().default(""),
  toneOfVoice: z.string().default(""),
  personality: z.array(z.string()).default([]),
  typography: z.object({ display: z.string().default(""), text: z.string().default(""), note: z.string().default("") }).default({}),
  logoSystem: z.string().default(""),
  photographyStyle: z.string().default(""),
  packagingStyle: z.string().default(""),
  visualIdentity: z.string().default(""),
  competitors: z.array(z.object({ name: z.string().default(""), note: z.string().default("") })).default([]),
  social: z.array(z.object({ platform: z.string().default(""), handle: z.string().default(""), url: z.string().default(""), note: z.string().default("") })).default([]),
  press: z.array(z.object({ title: z.string().default(""), source: z.string().default(""), url: z.string().default("") })).default([]),
  insights: z.array(z.string()).default([]),
  // Marketing history the director actually references — sourced from the Meta Ad Library, Instagram, press.
  campaigns: z.array(z.object({ title: z.string().default(""), year: z.string().default(""), channel: z.string().default(""), description: z.string().default(""), fronted: z.string().default(""), url: z.string().default("") })).default([]),
  ambassadors: z.array(z.object({ name: z.string().default(""), handle: z.string().default(""), note: z.string().default("") })).default([]),
  socialProof: z.array(z.object({ type: z.string().default(""), text: z.string().default(""), source: z.string().default(""), url: z.string().default("") })).default([]),
});

const withTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
};

const absolutize = (src: string, base: string): string | null => {
  try { return new URL(src, base).toString(); } catch { return null; }
};

async function isImageUrl(url: string): Promise<boolean> {
  try {
    const r = await withTimeout(url, { method: "HEAD" }, 5000);
    const ct = r.headers.get("content-type") || "";
    const len = Number(r.headers.get("content-length") || "0");
    return ct.startsWith("image/") && (len === 0 || len > 4000); // skip tiny tracking pixels when size is known
  } catch { return false; }
}

const UA = { "user-agent": "Mozilla/5.0 (compatible; BrandKitBot/1.0)" };
const fetchText = async (url: string, ms = 7000): Promise<string> => (await withTimeout(url, { headers: UA }, ms)).text();
const cleanName = (t: string): string =>
  t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(/\s+[|–—-]\s+/)[0].trim().slice(0, 80);
const stripHtml = (t: string): string => t.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "product";

/**
 * Shopify (and most modern CDNs) hand out tiny favicon-sized logos via ?width=32&height=32.
 * Strip the crop/height and bump the width so the harvested logo is a crisp, usable mark.
 * Exported so the client can repair already-saved logos at render time too.
 */
export function upscaleLogo(url: string, size = 480): string {
  try {
    const u = new URL(url);
    if (!/\/cdn\/shop\/|cdn\.shopify|\/cdn\//.test(u.href)) return url;
    u.searchParams.delete("crop");
    u.searchParams.delete("height");
    u.searchParams.set("width", String(size));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Shopify exposes the FULL catalogue at /products.json — the single richest source of
 * real product data: names, descriptions, variants, prices, options (sizes/colours) and
 * every image. Map it straight into our StudioProduct so nothing needs re-uploading.
 */
async function tryShopifyCatalog(base: string): Promise<StudioProduct[]> {
  try {
    const root = base.replace(/\/$/, "");
    const r = await withTimeout(`${root}/products.json?limit=250`, { headers: UA }, 9000);
    if (!r.ok) return [];
    const j: any = await r.json();
    const items = Array.isArray(j?.products) ? j.products : [];
    return items.map((p: any): StudioProduct | null => {
      const name = cleanName(String(p?.title ?? ""));
      if (!name) return null;
      const options: any[] = Array.isArray(p?.options) ? p.options : [];
      const opt = (re: RegExp): string[] => {
        const o = options.find((x) => re.test(String(x?.name ?? "")));
        return Array.isArray(o?.values) ? o.values.map((v: any) => String(v)).filter(Boolean) : [];
      };
      const variants: string[] = Array.isArray(p?.variants)
        ? p.variants.map((v: any) => String(v?.title ?? "")).filter((t: string) => t && t !== "Default Title")
        : [];
      const tags: string[] = Array.isArray(p?.tags) ? p.tags.map(String) : typeof p?.tags === "string" ? p.tags.split(",").map((s: string) => s.trim()) : [];
      const images: string[] = Array.isArray(p?.images)
        ? p.images.map((im: any) => (im?.src ? absolutize(String(im.src), base) : null)).filter(Boolean).slice(0, 8) as string[]
        : [];
      const price = p?.variants?.[0]?.price != null ? String(p.variants[0].price) : undefined;
      return {
        id: p?.id ? `shopify-${p.id}` : slug(name),
        name,
        category: p?.product_type ? String(p.product_type) : undefined,
        collection: tags[0] || (p?.product_type ? String(p.product_type) : undefined),
        description: p?.body_html ? stripHtml(String(p.body_html)).slice(0, 480) : undefined,
        variants: variants.length ? variants.slice(0, 20) : undefined,
        sizes: opt(/size/i).length ? opt(/size/i) : undefined,
        colours: opt(/colou?r/i).length ? opt(/colou?r/i) : undefined,
        price,
        url: p?.handle ? `${root}/products/${p.handle}` : undefined,
        images,
      };
    }).filter(Boolean) as StudioProduct[];
  } catch {
    return [];
  }
}

/** Pull Product entries out of JSON-LD structured data (name + description + price + images). */
function jsonLdProducts(html: string, base: string): StudioProduct[] {
  const out: StudioProduct[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data) ? data : data?.["@graph"] ? data["@graph"] : [data];
      for (const n of nodes) {
        const t = n?.["@type"];
        const isProduct = t === "Product" || (Array.isArray(t) && t.includes("Product"));
        if (!isProduct || !n?.name) continue;
        const name = cleanName(String(n.name));
        const imgs = (Array.isArray(n.image) ? n.image : [n.image])
          .map((im: any) => (typeof im === "object" ? im?.url : im))
          .filter((s: any) => typeof s === "string")
          .map((s: string) => absolutize(s, base))
          .filter(Boolean) as string[];
        const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        out.push({
          id: slug(name),
          name,
          description: n?.description ? stripHtml(String(n.description)).slice(0, 480) : undefined,
          category: n?.category ? String(n.category) : undefined,
          price: offer?.price != null ? String(offer.price) : undefined,
          url: typeof n?.url === "string" ? absolutize(n.url, base) || undefined : undefined,
          images: imgs.slice(0, 8),
        });
      }
    } catch {
      /* skip malformed block */
    }
  }
  return out;
}

/** Internal links that point at product pages, with their anchor text as a name hint. */
function productLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/\/products?\//i.test(m[1])) continue;
    const abs = absolutize(m[1], base); if (!abs) continue;
    out.push({ url: abs, text: cleanName(m[2]) });
  }
  return out;
}

function collectImages(html: string, base: string): Set<string> {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)[^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']+)["']/i)?.[1];
    const abs = c && absolutize(c, base); if (abs) urls.add(abs);
  }
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const ss = tag.match(/srcset=["']([^"']+)["']/i)?.[1];
    if (ss) { const last = ss.split(",").pop()?.trim().split(/\s+/)[0]; const abs = last && absolutize(last, base); if (abs) urls.add(abs); }
    const src = tag.match(/(?:data-src|src)=["']([^"']+)["']/i)?.[1];
    const abs = src && absolutize(src, base); if (abs) urls.add(abs);
  }
  return urls;
}

/**
 * Crawl the brand's OWN website to understand their real catalogue and shoot style: the
 * full product LINE-UP (rich StudioProducts) and a pool of their real product photos +
 * logo. Tries the Shopify catalogue first (richest), then JSON-LD and product-page links.
 * Best-effort and defensive: returns whatever resolves, or empty on any failure.
 */
async function harvestBrandSite(website: string, onCatalog?: (partial: { catalog: StudioProduct[]; logo?: string }) => void): Promise<{ logo?: string; productImages: string[]; catalog: StudioProduct[] }> {
  try {
    const base = /^https?:/i.test(website) ? website : `https://${website.replace(/^\/+/, "")}`;
    const html = await fetchText(base);

    // Product catalogue, deduped by lowercased name (richer entry wins on merge).
    const catalog = new Map<string, StudioProduct>();
    const add = (p: StudioProduct) => {
      const key = p.name.toLowerCase();
      if (!p.name || p.name.length < 2) return;
      const existing = catalog.get(key);
      if (!existing) { catalog.set(key, p); return; }
      catalog.set(key, {
        ...existing,
        ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))),
        images: Array.from(new Set([...(existing.images ?? []), ...(p.images ?? [])])).slice(0, 8),
      });
    };

    for (const p of await tryShopifyCatalog(base)) add(p); // 1) Shopify — the whole catalogue at once
    for (const p of jsonLdProducts(html, base)) add(p); //     2) JSON-LD on the homepage
    const links = productLinks(html, base);
    for (const l of links) if (l.text) add({ id: slug(l.text), name: l.text, images: [] }); // 3) names from product links

    // 4) If still thin, fetch a handful of product pages for their JSON-LD / og data.
    if (catalog.size < 8 && links.length) {
      const seen = new Set<string>();
      const pages = links.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true))).slice(0, 8);
      const fetched = await Promise.allSettled(pages.map(async (l) => {
        const h = await fetchText(l.url, 6000);
        const og = h.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || h.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        const ogImg = h.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
        return { ld: jsonLdProducts(h, l.url), name: og ? cleanName(og) : "", image: ogImg ? absolutize(ogImg, l.url) || undefined : undefined, url: l.url };
      }));
      for (const r of fetched) if (r.status === "fulfilled") {
        for (const p of r.value.ld) add(p);
        if (r.value.name) add({ id: slug(r.value.name), name: r.value.name, url: r.value.url, images: r.value.image ? [r.value.image] : [] });
      }
    }

    const products = [...catalog.values()].slice(0, 60);

    // Logo: prefer a high-res apple-touch-icon (usually the clean logo mark), then og:logo,
    // then the favicon as a last resort. Upscale Shopify thumbnails so it's actually visible.
    const apple = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*apple-touch-icon[^"']*["']/i)?.[1];
    const ogLogo = html.match(/<meta[^>]+property=["']og:logo["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const icon = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
    const pick = apple || ogLogo || icon;
    let logo: string | undefined;
    if (pick) { const abs = absolutize(pick, base); if (abs) logo = upscaleLogo(abs); }

    // Stream the catalogue + logo NOW — the product library only needs these, and they're
    // ready before the (slower) homepage-image HEAD verification below. So the library fills
    // the moment the crawl parses the catalogue, not after every image URL is validated.
    if (products.length) onCatalog?.({ catalog: products, logo });

    // Real product photos: catalogue hero images first, then a pass over homepage imagery.
    const fromCatalog = products.flatMap((p) => p.images.slice(0, 1));
    const fromHome = [...collectImages(html, base)].filter((u) => /^https?:/i.test(u) && !/\.svg(\?|$)/i.test(u) && !/sprite|icon|logo|favicon|placeholder/i.test(u));
    const ordered = Array.from(new Set([...fromCatalog, ...fromHome])).slice(0, 24);
    const checked = await Promise.allSettled(ordered.map(async (u) => ((await isImageUrl(u)) ? u : null)));
    const productImages = Array.from(new Set(checked.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])))).slice(0, 12);

    return { logo, productImages, catalog: products };
  } catch {
    return { productImages: [], catalog: [] };
  }
}

/**
 * Resolve the brand's real website for FREE (no paid API) by probing the obvious domains
 * derived from the name. Lets the site crawl run — and pull real products, photos, palette
 * and logo — even when no LLM/grounding is available to supply the URL. Returns "" if none
 * respond. Tries a compact slug (dotandkey) and a hyphenated one (sleep-or-die) across
 * common TLDs, in parallel, and picks the highest-priority host that answers.
 */
async function resolveWebsite(name: string): Promise<string> {
  const compact = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  const hyphen = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!compact) return "";
  const hosts = Array.from(new Set([compact, hyphen].filter(Boolean)));
  const candidates = hosts.flatMap((h) => [`https://www.${h}.com`, `https://${h}.com`, `https://www.${h}.co`, `https://${h}.in`]);
  const checked = await Promise.all(candidates.map(async (url) => {
    try { const r = await withTimeout(url, { headers: UA, redirect: "follow" }, 5000); return r.ok ? (r.url || url) : null; }
    catch { return null; }
  }));
  return checked.find((u): u is string => !!u) ?? "";
}

/** Normalise a pasted site to a bare host (drops scheme, www, path) for `site:` anchoring. */
function siteHost(website?: string): string {
  if (!website?.trim()) return "";
  try {
    const u = new URL(/^https?:/i.test(website) ? website : `https://${website.replace(/^\/+/, "")}`);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return website.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  }
}

/** The research question — one grounded pass that captures identity, story, products, and perception. */
function researchQuestion(brain: BrandBrain): string {
  const who = [brain.name, brain.category, brain.productType].filter(Boolean).join(", ");
  const selfDesc = [
    brain.audience && `audience: ${brain.audience}`,
    brain.vibe && `vibe: ${brain.vibe}`,
    brain.purpose && `purpose: ${brain.purpose}`,
    brain.ideology && `ideology / values: ${brain.ideology}`,
    brain.palette && `their stated colours: ${brain.palette}`,
  ].filter(Boolean).join("; ");
  // When the founder PASTED a site, that URL is the source of truth — anchor every search
  // to that exact domain so we study THEIR brand, not a same-named company the web surfaces.
  const site = siteHost(brain.website);
  const pasted = (brain.website || "").trim();
  const anchor = site
    ? `THE BRAND'S OFFICIAL WEBSITE IS ALREADY KNOWN: ${pasted} (domain: ${site}). This URL is the SOURCE OF TRUTH. Research the specific brand that owns ${site} — browse that exact domain and its own pages (home, about, products/collections, journal) and the socials it links to. When you search, anchor to this brand with \`site:${site}\` and "${brain.name}" ${site}. If search surfaces any OTHER company that merely shares the name or a different domain, IGNORE it entirely — do NOT blend it in. The WEBSITE root URL you return MUST be ${pasted}.\n\n`
    : "";
  const findStep = site
    ? `1) CONFIRM THE BRAND at ${site}. The website is fixed to ${pasted}; do NOT substitute another. Read that site and find the INSTAGRAM @handle it links to. Set foundReal=true if the site is a real, live brand.\n`
    : `1) FIND THE BRAND. Search the web. Give the exact official WEBSITE root URL (e.g. https://brand.com) and the INSTAGRAM @handle. Set foundReal=true if it's real & established.\n`;
  return (
    anchor +
    `Act as a brand strategist + creative director doing real, thorough web research. Brand: "${brain.name}"${who ? ` (${who})` : ""}.${selfDesc ? ` The founder describes it as — ${selfDesc}.` : ""}\n\n` +
    `MOST BRANDS HERE ARE ALREADY IN THE MARKET — assume established first. Recognise the brand; capture what they ALREADY have.\n` +
    findStep +
    `2) IDENTITY & STORY. Their real PURPOSE, MISSION, VISION, brand STORY / origin, and CORE VALUES. A sharp POSITIONING line. Who exactly they are FOR (target audience) and a vivid CUSTOMER PERSONA. Their TONE OF VOICE (3-5 words) and BRAND PERSONALITY traits.\n` +
    `3) VISUAL IDENTITY. Their real COLOUR palette (hex sampled from their actual site/feed, never invented), TYPOGRAPHY feel (display + text), LOGO system, PACKAGING style, and their PHOTOGRAPHY SIGNATURE described concretely enough to reproduce: backgrounds & surfaces, colour grade, styling density & props, lighting quality/direction, crops/compositions, product-only vs models.\n` +
    `4) PRODUCTS. Their product line / hero products and collections.\n` +
    `5) MARKET & FACES. 3-4 real COMPETITORS (one-line note each). And their BRAND AMBASSADORS / faces — the creators, celebrities, athletes, models or founders who represent them: search the web AND their Instagram (tagged posts, collabs, mentions) for each one's NAME, @HANDLE, and what they did for the brand.\n` +
    `6) SOCIAL. Their active platforms (Instagram, TikTok, LinkedIn, YouTube, Pinterest, X, Facebook) — content style, posting cadence, community, and voice on each.\n` +
    `7) PAST CAMPAIGNS. Find their real PAST & CURRENT marketing campaigns. CHECK THE META AD LIBRARY (facebook.com/ads/library — search the brand's page) for ads they are running or have run; scan their INSTAGRAM feed, reels and highlights for campaign launches and collabs; and press for campaign coverage. For EACH campaign capture: a title/theme, approx YEAR, the CHANNEL (Meta/Instagram ads, influencer, TV, OOH, email), a one-line description, WHO fronted it (ambassador/creator), and a source URL.\n` +
    `8) SOCIAL PROOF. Concrete proof of traction: awards, notable press features, follower scale per platform, viral moments, celebrity or UGC endorsements, retailer stockists, standout reviews/testimonials — each with a source.\n` +
    `9) PERCEPTION. How the internet actually perceives them — sentiment, community love or criticism, reputation.\n` +
    `10) INSIGHTS. 3-6 sharp KEY INSIGHTS a creative director would act on. And ARTICULATE the brand better than the founder did — an elevated one-line ESSENCE.\n` +
    `Be specific, real, and tasteful — never generic. If the brand has little web presence, research its exact CATEGORY & niche for the relevant market instead and say so.`
  );
}

/**
 * The brand dossier — a fast knowledge SYNTHESIS built for a tight serverless budget.
 *
 * Vercel Hobby kills a function at 60s, so research must finish well under that (crawl + dossier +
 * structuring + photo-rules). The old stacked web-search grounding chain ran 2-4 minutes and was
 * killed before the palette/brain were ever produced — and gpt-5.5 web_search does 0 searches for
 * most brands anyway. So we drop live grounding and write the dossier from the model's KNOWLEDGE
 * with a LEAN prompt (the heavy 10-section web-research prompt is what made even synthesis run
 * 60-90s). The site crawl (products, images, logo) already supplies the real, live brand data.
 * `reasoning_effort:"low"` is essential: without it the reasoning model spends the whole token
 * budget on hidden reasoning and returns EMPTY content (which is what made the palette never appear).
 */
async function groundedDossier(brain: BrandBrain): Promise<{ dossier: string; sources: number; inferred: boolean }> {
  const who = [brain.name, brain.category, brain.productType].filter(Boolean).join(", ");
  const extra = [brain.audience && `audience: ${brain.audience}`, brain.vibe && `vibe: ${brain.vibe}`, brain.palette && `stated colours: ${brain.palette}`].filter(Boolean).join("; ");
  const brief =
    `Brand: ${brain.name}${who && who !== brain.name ? ` (${who})` : ""}.` +
    (brain.website ? ` Official site: ${brain.website}.` : "") +
    (extra ? ` The founder adds — ${extra}.` : "") +
    ` You KNOW this brand (or, if it is genuinely obscure, reason confidently from its exact category and closest comparable brands). ` +
    `Write a concise, concrete brand dossier a creative director can act on TODAY — no preamble, no "information is missing", just the substance:\n` +
    `• WHO THEY ARE + a sharp POSITIONING line.\n` +
    `• AUDIENCE they're for + a vivid one-line PERSONA.\n` +
    `• TONE OF VOICE (3-5 words) and 3-4 PERSONALITY traits.\n` +
    `• VISUAL IDENTITY — their real COLOUR PALETTE as specific HEX codes (their actual brand colours, sampled from memory of their packaging/site — never a generic invented palette), TYPOGRAPHY feel, and their PHOTOGRAPHY SIGNATURE described concretely enough to reproduce (backgrounds & surfaces, colour grade, styling density, lighting quality/direction, crops, product-only vs models).\n` +
    `• Their hero PRODUCTS, 3-4 real COMPETITORS, and 3-5 sharp creative-director INSIGHTS.`;
  try {
    const dossier = await chatComplete({
      max_completion_tokens: 2600,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "You are a brand strategist + creative director. Write concrete, immediately-usable brand dossiers from your own knowledge. Be specific and real; NEVER refuse, hedge, or say information wasn't supplied — infer confidently." },
        { role: "user", content: brief },
      ],
    });
    return { dossier: dossier.trim() || `${brain.name} — a ${brain.category || "brand"}.`, sources: 0, inferred: true };
  } catch {
    return { dossier: `${brain.name} — a ${brain.category || "brand"}.`, sources: 0, inferred: true };
  }
}

/** Structure the core research fields (used by the workspace + art director). */
async function structureResearch(dossier: string, brain: BrandBrain): Promise<z.infer<typeof ResearchSchema>> {
  try {
    const content = await chatComplete({
      max_completion_tokens: 5000,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: `Convert brand research into STRICT JSON. Keys: summary, essence, voice, competitors (array of brand names), ambassadors (array), instagram (string), website (string root URL), palette (array of {hex, role}), aesthetic (string), foundReal (boolean). The "aesthetic" MUST be a concrete, reproducible PHOTOGRAPHY SIGNATURE — backgrounds & surfaces, colour grade, styling density & props, lighting quality/direction, crops, product-only vs models — describing what is ACTUALLY on their site/Instagram. For palette: ${brain.palette ? `the founder stated colours — use THOSE, converted to hex: ${brain.palette}` : "sample from their real feed or propose a fitting palette"}; always give hex codes. Return JSON only.` },
        { role: "user", content: dossier },
      ],
    });
    return parseLenient(ResearchSchema, content);
  } catch {
    return ResearchSchema.parse({});
  }
}

/**
 * Structure BOTH the core research AND the full intelligence dossier in ONE LLM call.
 * Two calls on the same dossier was pure latency (and double the tokens); folding them
 * into a single {research, intelligence} response roughly halves the structuring time.
 * Falls back to the two separate calls (in parallel) if the combined parse ever fails.
 */
const CombinedSchema = z.object({ research: ResearchSchema, intelligence: IntelligenceSchema });
async function structureAll(dossier: string, brain: BrandBrain): Promise<{ research: z.infer<typeof ResearchSchema>; intelligence: z.infer<typeof IntelligenceSchema> }> {
  try {
    const content = await chatComplete({
      max_completion_tokens: 2200,
      reasoning_effort: "none",
      messages: [
        { role: "system", content:
          `Convert this brand into STRICT JSON with EXACTLY two top-level keys: "research" and "intelligence". Fill everything from YOUR KNOWLEDGE of the brand — be concrete and confident, never say info is missing. Keep every field TIGHT (a sentence or two, not essays) so the whole object is compact.\n\n` +
          `"research" keys: summary, essence, voice, competitors (array of brand names), instagram (string), website (string root URL), palette (array of {hex, role}), aesthetic (string), foundReal (boolean). The "aesthetic" is a concrete, reproducible PHOTOGRAPHY SIGNATURE — backgrounds & surfaces, colour grade, styling, lighting, crops, product-only vs models. For palette: ${brain.palette ? `the founder stated colours — use THOSE as hex: ${brain.palette}` : "the brand's REAL colours from their packaging/site (recall them)"}; ALWAYS 4-8 real hex codes, never empty.\n\n` +
          `"intelligence" keys (keep each SHORT): overview (2 sentences), positioning (one sharp line), audience, persona (2-3 sentences), toneOfVoice (short), personality (array), values (array), typography {display, text, note}, photographyStyle (concrete & reproducible), visualIdentity (one line), competitors (array of {name, note}), insights (array of 3-5 sharp takeaways). Leave purpose, mission, vision, story, logoSystem, packagingStyle, campaigns, social, press, ambassadors and socialProof as "" or [] (skipped here for speed).\n\n` +
          `Every string must be plain text (not an object). Return JSON only.` },
        { role: "user", content: dossier },
      ],
    });
    const parsed = parseLenient(CombinedSchema, content);
    // A degenerate parse (model ignored the shape) → let the fallback do the focused calls.
    if (!parsed.research.summary && !parsed.intelligence.overview && !parsed.research.palette.length) throw new Error("combined structuring empty");
    return { research: parsed.research, intelligence: parsed.intelligence };
  } catch {
    // Safety net: the two focused calls, in parallel (original behaviour).
    const [research, intelligence] = await Promise.all([structureResearch(dossier, brain), buildIntelligence(dossier)]);
    return { research, intelligence };
  }
}

/** Structure the full Brand Intelligence dossier (the permanent Brand Brain). */
async function buildIntelligence(dossier: string): Promise<z.infer<typeof IntelligenceSchema>> {
  try {
    const content = await chatComplete({
      max_completion_tokens: 5000,
      reasoning_effort: "low",
      messages: [
        { role: "system", content:
          `Convert this brand research into STRICT JSON for a Brand Intelligence dossier. Use EXACTLY these keys, filling every one you can from the research (leave "" or [] if genuinely unknown — never invent hard facts, but DO articulate positioning/persona/insight):\n` +
          `overview (2-3 sentences), purpose, mission, vision, story (origin narrative), values (array of short phrases), positioning (one sharp line), audience (who it's for), persona (a vivid one-paragraph customer), toneOfVoice (short), personality (array of traits), typography {display, text, note}, logoSystem, photographyStyle (concrete & reproducible), packagingStyle, visualIdentity (overall design system in a sentence or two), competitors (array of {name, note}), social (array of {platform, handle, url, note} — one per active platform, note = content style/cadence/voice), press (array of {title, source, url}), insights (array of 3-6 sharp creative-director takeaways), campaigns (array of {title, year, channel, description, fronted, url} — real PAST/CURRENT marketing campaigns from the Meta Ad Library, Instagram and press), ambassadors (array of {name, handle, note} — the faces/creators/celebrities who represent them), socialProof (array of {type, text, source, url} — awards, press, follower scale, viral moments, endorsements, stockists).\n` +
          `Every string must be plain text (not an object). Return JSON only.` },
        { role: "user", content: dossier },
      ],
    });
    return parseLenient(IntelligenceSchema, content);
  } catch {
    return IntelligenceSchema.parse({});
  }
}

/**
 * The full research pipeline. Back-compatible: `researchBrand(brain)` still returns a
 * BrandResearch. Pass `onStage` to narrate progress and reach the richer results via the
 * returned object's `intelligence` and `catalog` (also merged onto the brain by callers).
 */
export async function researchBrand(brain: BrandBrain, opts: ResearchOpts = {}): Promise<BrandResearch & { intelligence: BrandIntelligence; catalog: StudioProduct[] }> {
  const onStage = opts.onStage ?? (() => {});

  // 1) Harvest the real site FIRST and IN PARALLEL with the slow grounded dossier. The crawl
  //    is free and fast (Shopify /products.json, JSON-LD, og tags) — a few seconds — while the
  //    grounded web-search research can take ~2 minutes. Products must NOT wait on it, so we
  //    kick the crawl off now, straight from the pasted site, and stream the product DATA the
  //    moment it lands (a "products" stage) so the library fills immediately. `done` still
  //    carries the full catalogue as the source of truth.
  const crawlSite = brain.website?.trim() || (await resolveWebsite(brain.name ?? ""));
  const emptyHarvest = { productImages: [] as string[], logo: undefined as string | undefined, catalog: [] as StudioProduct[] };
  // Fire the product library the INSTANT the catalogue parses (before image verification /
  // the whole research pass), so products stop "taking a lot of time" to appear. productImages
  // is omitted here (undefined) so the client keeps what it has until the enriched pass lands.
  const emitCatalogEarly = (partial: { catalog: StudioProduct[]; logo?: string }) => {
    if (crawlSite) onStage("website", { website: crawlSite });
    onStage("catalog", { count: partial.catalog.length });
    onStage("products", { catalog: partial.catalog, logo: partial.logo, website: crawlSite });
  };
  const harvestPromise = (crawlSite ? harvestBrandSite(crawlSite, emitCatalogEarly) : Promise.resolve(emptyHarvest)).then((h) => {
    onStage("images", { count: h.productImages.length });
    // Re-emit with the verified productImages now attached (catalogue already streamed early).
    onStage("products", { catalog: h.catalog, productImages: h.productImages, logo: h.logo, website: crawlSite });
    return h;
  }).catch(() => emptyHarvest);

  // 2) Await the crawl FIRST so the REAL scraped site + products ANCHOR the structuring to the
  //    EXACT brand. Without this anchor the model was describing a DIFFERENT company that shares the
  //    name (the "wrong brand" bug). Still fast: the crawl runs while nothing blocks, and the
  //    trimmed single structuring call is ~25s, so the whole pass stays well inside 60s.
  const harvested = await harvestPromise;
  const site = crawlSite || brain.website?.trim() || "";
  const productNames = harvested.catalog.map((p) => p.name).filter(Boolean).slice(0, 20);
  const dossier =
    `Research THIS EXACT brand — the real company that owns ${site || "the products listed below"}, NOT a different, bigger, or better-known company that merely shares the name.\n` +
    `Brand: ${brain.name}${brain.category ? ` — ${brain.category}` : ""}${brain.productType ? ` (${brain.productType})` : ""}.` +
    (site ? `\nOfficial website (the source of truth): ${site}.` : "") +
    (productNames.length ? `\nTheir ACTUAL products, scraped LIVE from their own site (this is unmistakably the real brand): ${productNames.join(", ")}.` : "") +
    (brain.audience ? `\nAudience: ${brain.audience}.` : "") +
    (brain.vibe ? `\nVibe: ${brain.vibe}.` : "") +
    (brain.palette ? `\nFounder-stated colours: ${brain.palette}.` : "") +
    `\n\nUsing the site + real products above as the GROUND TRUTH for which brand this is, fill the dossier: positioning, audience, tone of voice, visual identity, COLOUR PALETTE (real hex codes true to THEIR packaging/site), photography signature, competitors and insights. If you don't recognise them, infer confidently from their real products + category — but NEVER substitute or describe a different same-named brand, and NEVER say information is missing.`;
  const sources = 0;
  const inferred = true;
  const structurePromise = structureAll(dossier, brain);

  // 3) The photo rulebook — a nice-to-have (finishing hints) and the pass most likely to be slow
  //    (Gemini vision), so it's HARD-capped: it can NEVER hold up the palette / brand brain.
  const photoRulesPromise = Promise.race([
    extractPhotoRules({ images: harvested.productImages, category: brain.category, productType: brain.productType, aesthetic: brain.vibe }).catch(() => undefined),
    new Promise<undefined>((res) => setTimeout(() => res(undefined), 15_000)),
  ]);

  const { research: structured, intelligence: intel } = await structurePromise;
  // The site actually crawled (pasted URL) wins for storage; fall back to the LLM's URL.
  const website = crawlSite || brain.website?.trim() || structured.website?.trim() || "";
  // Now that the grounded palette exists, re-emit the images stage enriched with it.
  onStage("images", { count: harvested.productImages.length, palette: structured.palette });
  const photoRules = await photoRulesPromise;

  const intelligence: BrandIntelligence = {
    overview: intel.overview || structured.summary,
    purpose: intel.purpose,
    mission: intel.mission,
    vision: intel.vision,
    story: intel.story,
    values: intel.values,
    positioning: intel.positioning || structured.essence,
    audience: intel.audience || brain.audience,
    persona: intel.persona,
    toneOfVoice: intel.toneOfVoice || structured.voice,
    personality: intel.personality,
    palette: structured.palette,
    typography: intel.typography,
    logo: harvested.logo,
    logoSystem: intel.logoSystem,
    photographyStyle: intel.photographyStyle || structured.aesthetic,
    packagingStyle: intel.packagingStyle,
    visualIdentity: intel.visualIdentity,
    competitors: (intel.competitors?.length ? intel.competitors : (structured.competitors ?? []).map((name) => ({ name }))).filter((c) => c.name),
    social: (intel.social ?? []).filter((s) => s.platform),
    press: (intel.press ?? []).filter((p) => p.title),
    insights: intel.insights,
    campaigns: (intel.campaigns ?? []).filter((c) => c.title),
    ambassadors: (intel.ambassadors ?? []).filter((a) => a.name),
    socialProof: (intel.socialProof ?? []).filter((p) => p.text),
    website,
    instagram: structured.instagram,
    sources,
    foundReal: structured.foundReal,
    inferred,
  };
  onStage("intelligence", { ready: true });

  const research: BrandResearch = {
    summary: structured.summary || dossier.slice(0, 700),
    essence: structured.essence ?? "",
    voice: structured.voice ?? "",
    competitors: structured.competitors ?? [],
    ambassadors: structured.ambassadors ?? [],
    instagram: structured.instagram ?? "",
    website,
    palette: structured.palette ?? [],
    aesthetic: structured.aesthetic ?? "",
    foundReal: structured.foundReal ?? false,
    logo: harvested.logo,
    productImages: harvested.productImages,
    products: harvested.catalog.map((p) => ({ name: p.name, image: p.images[0] })),
    photoRules: photoRules ?? undefined,
    sources,
  };

  return { ...research, intelligence, catalog: harvested.catalog };
}
