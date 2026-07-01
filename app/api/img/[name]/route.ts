import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";

const GEN = join(process.cwd(), "generated");
const CACHE = join(GEN, ".thumbs");

/**
 * Serve a generated image from /generated.
 *
 * The originals are large PNGs (2–6 MB). The canvas grid only needs a small,
 * compressed copy, so `?w=<width>` returns a resized WebP (≈20–30× smaller) — built
 * once, cached to disk, and cached immutably in the browser. No `w` → the full-res
 * original (used for download and as a render reference).
 */
/** Sniff the real image type from magic bytes — renders save as `.png` but the model
 *  may return JPEG/WebP, and a mismatched content-type can break <img>/downloads. */
function sniffType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57) return "image/webp";
  return "image/png";
}

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const file = basename(params.name);
  const src = join(GEN, file);
  const { searchParams } = new URL(req.url);
  const w = Math.min(2048, Math.max(0, Number(searchParams.get("w")) || 0));

  // Full-res original.
  if (!w) {
    try {
      const buf = await readFile(src);
      return new Response(new Uint8Array(buf), {
        headers: { "content-type": sniffType(buf), "cache-control": "public, max-age=31536000, immutable" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  // Resized WebP thumbnail, disk-cached.
  const thumb = join(CACHE, `${file}.w${w}.webp`);
  try {
    const cached = await readFile(thumb);
    return webp(cached);
  } catch {
    /* not cached yet — build it */
  }
  try {
    const out = await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    mkdir(CACHE, { recursive: true })
      .then(() => writeFile(thumb, out))
      .catch(() => {});
    return webp(out);
  } catch {
    // Fall back to the original if resizing fails.
    try {
      const buf = await readFile(src);
      return new Response(new Uint8Array(buf), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
}

function webp(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
  });
}
