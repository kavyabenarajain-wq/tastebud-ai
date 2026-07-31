import { all, run, genId, nowISO } from "./db";

/**
 * Images — the durable record of every delivered image, owned by the account that made it.
 *
 * The Blob object itself is public and carries no owner metadata, so a customer's "my images" list
 * can only be reconstructed from these rows. One row per delivered image; brand_id/slug are optional
 * (a plain product/model shoot has no campaign). Keyed by account_id = the verified session email.
 */

export type ImageKind = "product" | "model" | "campaign" | "upscale" | "enhance" | "other";

export type RecordImageInput = {
  account: string; // the verified session email
  url: string;
  kind: ImageKind;
  brandId?: string | null;
  slug?: string | null;
  prompt?: string | null;
  meta?: unknown; // serialized to meta_json
};

export type StoredImage = {
  id: string;
  url: string;
  kind: string;
  slug: string | null;
  brand_id: string | null;
  created_at: string;
};

/** Append one delivered image to an account's gallery. No-op on a missing account/url (never throws
 *  the caller — image delivery must not fail because bookkeeping did). */
export async function recordImage(input: RecordImageInput): Promise<void> {
  if (!input.account || !input.url) return;
  await run(
    `INSERT INTO images (id, account_id, brand_id, slug, kind, url, prompt, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId("img"),
      input.account,
      input.brandId ?? null,
      input.slug ?? null,
      input.kind,
      input.url,
      input.prompt ?? null,
      input.meta === undefined || input.meta === null ? null : JSON.stringify(input.meta),
      nowISO(),
    ],
  );
}

/** An account's images, newest first. */
export async function listImages(account: string, limit = 300): Promise<StoredImage[]> {
  if (!account) return [];
  return all<StoredImage>(
    "SELECT id, url, kind, slug, brand_id, created_at FROM images WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
    [account, limit],
  );
}

/** Count of an account's images (for the profile/CRM surfaces). */
export async function countImages(account: string): Promise<number> {
  const row = await all<{ n: number }>("SELECT COUNT(*) AS n FROM images WHERE account_id = ?", [account]);
  return Number(row[0]?.n ?? 0);
}
