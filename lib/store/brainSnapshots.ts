import { all, one, run, genId, nowISO } from "./db";

/**
 * Brain snapshots — the safety net for the live brand brain.
 *
 * `brands.brain_json` is overwritten IN PLACE on every saveBrain / recordShotDecision, and the live
 * store keeps no other history. Before each overwrite we copy the PRIOR brain here, so a bad write —
 * a wrong-brand mutation, a corrupt research pass, a fat-fingered restore — is always recoverable.
 * Append-only; pruned to the last N snapshots PER (brand, reason) so frequent shot-decision snapshots
 * can never evict the precious, infrequent research snapshots.
 *
 * Best-effort by design: a snapshot failure must never block the underlying save (the same
 * "bookkeeping never fails the caller" idiom used by recordImage / logEvent). We log and move on.
 */

const KEEP_PER_REASON = 30;

/** True when a brain body is worth keeping — skips the empty '{}' shells guidelines/campaigns create. */
function worthKeeping(brainJson: string | null | undefined): boolean {
  if (!brainJson) return false;
  const t = brainJson.trim();
  return t.length > 2 && t !== "{}" && t !== "null";
}

/** Copy the PRIOR brain into history, just before it is overwritten. Never throws. */
export async function snapshotBrain(
  brandId: string,
  prevBrainJson: string | null | undefined,
  reason: string,
  slug?: string | null,
): Promise<void> {
  try {
    if (!brandId || !worthKeeping(prevBrainJson)) return;
    await run(
      "INSERT INTO brain_snapshots (id, brand_id, slug, reason, brain_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [genId("snap"), brandId, slug ?? null, reason, prevBrainJson as string, nowISO()],
    );
    // Prune within the reason bucket so shot-decision churn can't evict research snapshots.
    await run(
      `DELETE FROM brain_snapshots WHERE brand_id = ? AND reason = ? AND id NOT IN (
         SELECT id FROM brain_snapshots WHERE brand_id = ? AND reason = ?
         ORDER BY created_at DESC, id DESC LIMIT ?
       )`,
      [brandId, reason, brandId, reason, KEEP_PER_REASON],
    );
  } catch (e) {
    console.error("[store] snapshotBrain failed (non-fatal):", (e as Error).message);
  }
}

export type BrainSnapshot = {
  id: string;
  brand_id: string;
  slug: string | null;
  reason: string | null;
  brain_json: string;
  created_at: string;
};

/** History for one brand, newest first (brain_json included so a row is enough to restore). */
export async function listBrainSnapshots(brandId: string, limit = 50): Promise<BrainSnapshot[]> {
  if (!brandId) return [];
  return all<BrainSnapshot>(
    "SELECT id, brand_id, slug, reason, brain_json, created_at FROM brain_snapshots WHERE brand_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    [brandId, limit],
  );
}

/** One snapshot by id. */
export async function getBrainSnapshot(id: string): Promise<BrainSnapshot | undefined> {
  if (!id) return undefined;
  return one<BrainSnapshot>(
    "SELECT id, brand_id, slug, reason, brain_json, created_at FROM brain_snapshots WHERE id = ?",
    [id],
  );
}

/**
 * Restore a snapshot back onto its brand. Snapshots the CURRENT brain first (reason "pre-restore"),
 * so a restore is itself reversible. Returns false if the snapshot is gone.
 */
export async function restoreBrainSnapshot(id: string): Promise<boolean> {
  const snap = await getBrainSnapshot(id);
  if (!snap) return false;
  const cur = await one<{ brain_json: string }>("SELECT brain_json FROM brands WHERE id = ?", [snap.brand_id]);
  if (cur) await snapshotBrain(snap.brand_id, cur.brain_json, "pre-restore", snap.slug);
  await run("UPDATE brands SET brain_json = ?, updated_at = ? WHERE id = ?", [snap.brain_json, nowISO(), snap.brand_id]);
  return true;
}
