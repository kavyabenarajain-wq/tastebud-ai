/**
 * A lightweight DISPLAY thumbnail for a product image. Scraped product photos are
 * full-resolution (Shopify hero images are often ~0.7–2 MB each) — rendering a gallery
 * of them at thumbnail size loads tens of MB and stalls the page. Shopify's CDN resizes
 * on the fly via a `width` query param, so we request a small variant for display only.
 *
 * The full-resolution URL is still used for actual generation (the renderer wants quality).
 * Client-safe (pure string work) so pages/components can import it directly.
 */
export function thumb(url?: string, width = 500): string {
  if (!url) return "";
  // The app's own served/generated images: use the built-in resizer.
  if (url.startsWith("/api/img/")) return `${url}${url.includes("?") ? "&" : "?"}w=${width}`;
  try {
    const u = new URL(url);
    // Shopify CDN (incl. custom domains proxying /cdn/shop/) honours width for on-the-fly resize.
    if (/cdn\.shopify\.com/.test(u.hostname) || /\/cdn\/shop\//.test(u.pathname)) {
      u.searchParams.set("width", String(width));
      u.searchParams.delete("height");
      u.searchParams.delete("crop");
      return u.toString();
    }
  } catch {
    /* not a parseable URL (e.g. data: URL) — leave as-is */
  }
  return url;
}
