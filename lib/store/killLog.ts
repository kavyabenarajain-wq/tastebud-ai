import { all, run, genId, nowISO } from "./db";
import type { ShotMemory } from "../types";

/**
 * The kill-log — every creative decision (keep / reject / hero) as an append-only row.
 *
 * The brain's memory lists (approvedShots / rejectedShots / heroShots) are capped at 24 and lossy —
 * they exist to steer the planner, not to remember. THIS never forgets: what the human accepted, what
 * they killed, and (once the UI captures it) WHY. It is joinable to `images` by url, so the taste
 * signal ties back to the exact delivered asset. This is the training substrate for the taste
 * function — the thing that eventually lets the creative director step out of the loop.
 *
 * Append-only and best-effort: a logging failure must never break a decision the user just made.
 */

export type KillLogInput = {
  account?: string | null;
  brandId?: string | null;
  slug?: string | null;
  shot: ShotMemory;
  imageId?: string | null; // durable images.id, when known
  reason?: string | null; // free-text "why" (human-captured, or the QC judge's reasons for a machine kill)
  failedBar?: string | null; // which bar it failed: product | model | feed | ad | taste
  decision?: string | null; // overrides shot.decision — e.g. "qc-reject" for an automated rejection
};

/** Append one decision. Never throws. */
export async function recordKill(input: KillLogInput): Promise<void> {
  try {
    const s = input.shot;
    if (!s) return;
    await run(
      `INSERT INTO kill_log
         (id, account_id, brand_id, slug, image_id, shot_id, url, mode, angle, panel, decision, reason, failed_bar, prompt, negatives_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        genId("kill"),
        input.account ?? null,
        input.brandId ?? null,
        input.slug ?? null,
        input.imageId ?? null,
        s.id ?? null,
        s.url ?? null,
        s.mode ?? null,
        s.angle ?? null,
        s.panel ? JSON.stringify(s.panel) : null,
        input.decision ?? s.decision,
        input.reason ?? null,
        input.failedBar ?? null,
        s.prompt ?? null,
        s.negatives && s.negatives.length ? JSON.stringify(s.negatives) : null,
        nowISO(),
      ],
    );
  } catch (e) {
    console.error("[store] recordKill failed (non-fatal):", (e as Error).message);
  }
}

export type KillRow = {
  id: string;
  account_id: string | null;
  brand_id: string | null;
  slug: string | null;
  image_id: string | null;
  shot_id: string | null;
  url: string | null;
  mode: string | null;
  angle: string | null;
  panel: string | null;
  decision: string;
  reason: string | null;
  failed_bar: string | null;
  prompt: string | null;
  negatives_json: string | null;
  created_at: string;
};

/** Decisions for one brand, newest first. Optionally filter by decision. */
export async function listKills(
  brandId: string,
  opts: { decision?: ShotMemory["decision"]; limit?: number } = {},
): Promise<KillRow[]> {
  if (!brandId) return [];
  const limit = opts.limit ?? 200;
  if (opts.decision) {
    return all<KillRow>(
      "SELECT * FROM kill_log WHERE brand_id = ? AND decision = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      [brandId, opts.decision, limit],
    );
  }
  return all<KillRow>("SELECT * FROM kill_log WHERE brand_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", [brandId, limit]);
}

/** Decision counts for a brand — the shape of taste at a glance. */
export async function killStats(
  brandId: string,
): Promise<{ keep: number; reject: number; hero: number; total: number }> {
  const rows = await all<{ decision: string; n: number }>(
    "SELECT decision, COUNT(*) AS n FROM kill_log WHERE brand_id = ? GROUP BY decision",
    [brandId],
  );
  const by = (d: string) => Number(rows.find((r) => r.decision === d)?.n ?? 0);
  const keep = by("keep"), reject = by("reject"), hero = by("hero");
  return { keep, reject, hero, total: keep + reject + hero };
}
