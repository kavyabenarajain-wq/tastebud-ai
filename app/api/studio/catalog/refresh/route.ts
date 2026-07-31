import type { NextRequest } from "next/server";
import { refreshCatalog } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Re-harvest a brand's product catalogue straight from their live site and return it with images.
 * Powers the product library's self-heal: when a saved catalogue came back as names with no photos
 * (e.g. a Shopify store whose URL carried a `?srsltid=` tracking query that used to break harvesting),
 * the library calls this to pull the real products + images without re-running the whole research pass.
 */
export async function POST(req: NextRequest) {
  const { website } = (await req.json().catch(() => ({}))) as { website?: string };
  if (!website?.trim()) return Response.json({ catalog: [], error: "missing website" }, { status: 400 });
  try {
    const { catalog, logo, productImages } = await refreshCatalog(website.trim());
    return Response.json({ catalog, logo, productImages });
  } catch (e) {
    return Response.json({ catalog: [], error: (e as Error).message }, { status: 200 });
  }
}
