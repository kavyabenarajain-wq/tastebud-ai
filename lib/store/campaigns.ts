import type { Campaign, CampaignOutput } from "../types";
import { one, all, run, batch, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";

/**
 * Campaigns — the container grouping one brief's multi-format / multi-frame outputs
 * (ad fan-outs, carousels, posts). One row per campaign (blob payload), scoped to a brand.
 * An update with empty outputs keeps the assets already accumulated (a rename / copy edit
 * can never wipe them).
 */

const CAMPAIGN_CAP = 60;

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Ensure a brand row exists for this slug (campaigns may arrive before the brain is saved). */
async function ensureBrandId(slug: string, account: string): Promise<string> {
  let id = await brandIdBySlug(slug, account);
  if (!id) {
    id = genId("brd");
    const ts = nowISO();
    await run("INSERT INTO brands (id, account_id, slug, name, brain_json, has_research, has_guidelines, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 0, 0, ?, ?)",
      [id, account, slug, slug, ts, ts]);
  }
  return id;
}

/** Every campaign for a brand, newest-updated first. */
export async function getCampaigns(slug: string, account = DEFAULT_ACCOUNT): Promise<Campaign[]> {
  const brandId = await brandIdBySlug(slug, account);
  if (!brandId) return [];
  const rows = await all<{ data_json: string }>("SELECT data_json FROM campaigns WHERE brand_id = ? ORDER BY updated_at DESC", [brandId]);
  return rows.map((r) => safeParse<Campaign>(r.data_json)).filter(Boolean) as Campaign[];
}

/** Upsert one campaign by id (empty outputs keep the accumulated ones). */
export async function saveCampaign(slug: string, campaign: Campaign, account = DEFAULT_ACCOUNT): Promise<Campaign> {
  const brandId = await ensureBrandId(slug, account);
  const existing = await one<{ data_json: string }>("SELECT data_json FROM campaigns WHERE id = ? AND brand_id = ?", [campaign.id, brandId]);
  const prev = existing ? safeParse<Campaign>(existing.data_json) : null;
  const merged: Campaign = prev
    ? { ...prev, ...campaign, outputs: campaign.outputs?.length ? campaign.outputs : prev.outputs }
    : { ...campaign, outputs: campaign.outputs ?? [] };
  merged.updatedAt = nowISO();

  if (prev) await run("UPDATE campaigns SET data_json = ?, updated_at = ? WHERE id = ? AND brand_id = ?", [JSON.stringify(merged), merged.updatedAt, campaign.id, brandId]);
  else await run("INSERT INTO campaigns (id, brand_id, data_json, updated_at) VALUES (?, ?, ?, ?)", [campaign.id, brandId, JSON.stringify(merged), merged.updatedAt]);

  // Cap: keep only the newest CAMPAIGN_CAP for this brand.
  const ids = await all<{ id: string }>("SELECT id FROM campaigns WHERE brand_id = ? ORDER BY updated_at DESC", [brandId]);
  if (ids.length > CAMPAIGN_CAP) {
    await batch(ids.slice(CAMPAIGN_CAP).map(({ id }) => ({ sql: "DELETE FROM campaigns WHERE brand_id = ? AND id = ?", args: [brandId, id] })));
  }
  return merged;
}

/** Attach / replace one output on a campaign (de-duped by shot id, carousel order kept). */
export async function upsertCampaignOutput(slug: string, campaignId: string, output: CampaignOutput, account = DEFAULT_ACCOUNT): Promise<Campaign | null> {
  const brandId = await brandIdBySlug(slug, account);
  if (!brandId) return null;
  const existing = await one<{ data_json: string }>("SELECT data_json FROM campaigns WHERE id = ? AND brand_id = ?", [campaignId, brandId]);
  const c = existing ? safeParse<Campaign>(existing.data_json) : null;
  if (!c) return null;
  c.outputs = [...(c.outputs ?? []).filter((o) => o.id !== output.id), output].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  c.updatedAt = nowISO();
  await run("UPDATE campaigns SET data_json = ?, updated_at = ? WHERE id = ? AND brand_id = ?", [JSON.stringify(c), c.updatedAt, campaignId, brandId]);
  return c;
}
