import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { put } from "@vercel/blob";
import sharp from "sharp";

/**
 * Encode a stored image as WebP for the WEB. A 4K render is a ~26MB PNG that a browser can't
 * display inline (it downloads but shows broken) — the same image as WebP is ~1-3MB and displays
 * instantly, at effectively identical visual quality (q92). We always store .webp so the served
 * URL is light; sharp reads it back fine for QC / reformat / export. Falls back to the raw bytes
 * (keeping the .png name) only if the encode fails.
 */
async function toWebp(buf: Buffer, pathname: string): Promise<{ buf: Buffer; name: string; contentType: string }> {
  const clean = pathname.replace(/^\/+/, "");
  try {
    const out = await sharp(buf).webp({ quality: 92 }).toBuffer();
    return { buf: out, name: clean.replace(/\.(png|jpe?g|webp)$/i, ".webp"), contentType: "image/webp" };
  } catch {
    return { buf, name: clean, contentType: "image/png" };
  }
}

/**
 * Image storage — one seam, two homes (mirrors the DB store):
 *
 *   • local dev  → the /generated folder on disk, served by /api/img (unchanged behaviour).
 *   • serverless → Vercel Blob when a store is connected (BLOB_READ_WRITE_TOKEN is set) —
 *                  because Vercel's filesystem is READ-ONLY, so writing a rendered PNG to
 *                  /var/task/generated throws ENOENT. Blob returns a public CDN URL instead.
 *
 * `toInline()` in image.ts already reads http(s) URLs by fetching, so a Blob URL round-trips
 * back into the pipeline (reformat / enhance / export / QC) for free. The two in-place ops
 * (finish / enlarge) use overwriteImage() to re-write the SAME URL.
 */

const GEN_DIR = join(process.cwd(), "generated");

/**
 * The Blob read-write token. Standard name first; else DETECT it by value — Vercel's Blob
 * integration can name the var with a custom prefix (e.g. TASTEBUD_AI_BLOB_READ_WRITE_TOKEN), so
 * we find whichever env var holds a `vercel_blob_rw_…` token. Passed EXPLICITLY to put() so it
 * never depends on the default env name matching.
 */
function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
    || Object.values(process.env).find((v): v is string => typeof v === "string" && /^vercel_blob_rw_/.test(v));
}

/**
 * True when a Vercel Blob store is reachable — EITHER a read-write token, OR a newer OIDC-connected
 * store (Vercel injects BLOB_STORE_ID and no token; @vercel/blob then authenticates via the runtime
 * OIDC identity). This is the fix for "connected via OIDC" stores where there is no *_rw_ token.
 */
export function blobEnabled(): boolean {
  return !!blobToken() || !!process.env.BLOB_STORE_ID;
}

/** put() to Blob — pass the read-write token when we have one, else rely on the OIDC connection. */
async function blobPut(name: string, buf: Buffer, contentType: string): Promise<string> {
  const token = blobToken();
  const opts = { access: "public" as const, contentType, addRandomSuffix: false, allowOverwrite: true };
  const { url } = token ? await put(name, buf, { ...opts, token }) : await put(name, buf, opts);
  return url;
}

/**
 * Persist an image under a STABLE pathname (e.g. "<id>.png") and return its public URL.
 * Blob when connected, else the local file. addRandomSuffix:false + allowOverwrite keep the
 * URL deterministic from the pathname, so an in-place re-write lands on the SAME URL.
 */
export async function putImage(pathname: string, buf: Buffer, _contentType = "image/png"): Promise<string> {
  const { buf: out, name, contentType } = await toWebp(buf, pathname); // → light .webp for the web
  if (blobEnabled()) return blobPut(name, out, contentType);
  // No Blob store reachable → local disk (fails on Vercel's read-only FS). Log WHY generation ENOENTs.
  console.warn("[storage] no Vercel Blob store (no token, no BLOB_STORE_ID) — writing to local disk.");
  await mkdir(GEN_DIR, { recursive: true });
  await writeFile(join(GEN_DIR, name), out);
  return `/api/img/${name}`;
}

/** Read an image's bytes from a Blob/http URL, a served /api/img path, or a local/public path. */
export async function readImageBytes(ref: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(ref)) return Buffer.from(await (await fetch(ref)).arrayBuffer());
  if (ref.startsWith("/api/img/")) return readFile(join(GEN_DIR, basename(ref)));
  if (ref.startsWith("/")) return readFile(join(process.cwd(), "public", ref));
  return readFile(ref);
}

/** Overwrite an existing image (keep the same URL) with new bytes — the in-place re-write path. */
export async function overwriteImage(url: string, buf: Buffer, _contentType = "image/png"): Promise<void> {
  if (/^https?:\/\//i.test(url)) {
    if (!blobEnabled()) return; // a remote non-blob URL isn't ours to rewrite
    const pathname = new URL(url).pathname.replace(/^\/+/, "");
    const { buf: out, name, contentType } = await toWebp(buf, pathname); // keep the .webp pathname
    await blobPut(name, out, contentType);
    return;
  }
  if (url.startsWith("/api/img/")) {
    const { buf: out } = await toWebp(buf, basename(url));
    await mkdir(GEN_DIR, { recursive: true });
    await writeFile(join(GEN_DIR, basename(url)), out);
  }
}
