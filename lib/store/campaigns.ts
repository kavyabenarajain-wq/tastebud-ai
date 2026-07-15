import type { Campaign, CampaignOutput } from "../types";
import { getDb, tx, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";

/**
 * Campaigns — the container grouping one brief's multi-format / multi-frame outputs
 * (ad fan-outs, carousels, posts). One row per campaign (blob payload), scoped to a brand.
 * All upserts are atomic, so a rename / copy edit / new output can't clobber the assets.
 */

const CAMPAIGN_CAP = 60;

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Ensure a brand row exists for this slug (campaigns may arrive before the brain is saved). */
function ensureBrandId(slug: string, account: string): string {
  const db = getDb();
  let id = brandIdBySlug(db, slug, account);
  if (!id) {
    id = genId("brd");
    const ts = nowISO();
    db.prepare("INSERT INTO brands (id, account_id, slug, name, brain_json, has_research, has_guidelines, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 0, 0, ?, ?)")
      .run(id, account, slug, slug, ts, ts);
  }
  return id;
}

/** Every campaign for a brand, newest-updated first. */
export async function getCampaigns(slug: string, account = DEFAULT_ACCOUNT): Promise<Campaign[]> {
  const db = getDb();
  const brandId = brandIdBySlug(db, slug, account);
  if (!brandId) return [];
  const rows = db.prepare("SELECT data_json FROM campaigns WHERE brand_id = ? ORDER BY updated_at DESC").all(brandId) as unknown as { data_json: string }[];
  return rows.map((r) => safeParse<Campaign>(r.data_json)).filter(Boolean) as Campaign[];
}

/**
 * Upsert one campaign by id. An update with empty outputs keeps the outputs already
 * accumulated (so a rename / copy edit can never wipe the assets).
 */
export async function saveCampaign(slug: string, campaign: Campaign, account = DEFAULT_ACCOUNT): Promise<Campaign> {
  return tx(() => {
    const db = getDb();
    const brandId = ensureBrandId(slug, account);
    const existing = db.prepare("SELECT data_json FROM campaigns WHERE id = ? AND brand_id = ?").get(campaign.id, brandId) as unknown as { data_json: string } | undefined;
    const prev = existing ? safeParse<Campaign>(existing.data_json) : null;
    const merged: Campaign = prev
      ? { ...prev, ...campaign, outputs: campaign.outputs?.length ? campaign.outputs : prev.outputs }
      : { ...campaign, outputs: campaign.outputs ?? [] };
    merged.updatedAt = nowISO();

    if (prev) db.prepare("UPDATE campaigns SET data_json = ?, updated_at = ? WHERE id = ? AND brand_id = ?").run(JSON.stringify(merged), merged.updatedAt, campaign.id, brandId);
    else db.prepare("INSERT INTO campaigns (id, brand_id, data_json, updated_at) VALUES (?, ?, ?, ?)").run(campaign.id, brandId, JSON.stringify(merged), merged.updatedAt);

    // Cap: keep only the newest CAMPAIGN_CAP for this brand.
    const ids = db.prepare("SELECT id FROM campaigns WHERE brand_id = ? ORDER BY updated_at DESC").all(brandId) as unknown as { id: string }[];
    if (ids.length > CAMPAIGN_CAP) {
      const del = db.prepare("DELETE FROM campaigns WHERE brand_id = ? AND id = ?");
      for (const { id } of ids.slice(CAMPAIGN_CAP)) del.run(brandId, id);
    }
    return merged;
  });
}

/** Attach / replace one output on a campaign (de-duped by shot id, carousel order kept). */
export async function upsertCampaignOutput(slug: string, campaignId: string, output: CampaignOutput, account = DEFAULT_ACCOUNT): Promise<Campaign | null> {
  return tx(() => {
    const db = getDb();
    const brandId = brandIdBySlug(db, slug, account);
    if (!brandId) return null;
    const existing = db.prepare("SELECT data_json FROM campaigns WHERE id = ? AND brand_id = ?").get(campaignId, brandId) as unknown as { data_json: string } | undefined;
    const c = existing ? safeParse<Campaign>(existing.data_json) : null;
    if (!c) return null;
    c.outputs = [...(c.outputs ?? []).filter((o) => o.id !== output.id), output].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    c.updatedAt = nowISO();
    db.prepare("UPDATE campaigns SET data_json = ?, updated_at = ? WHERE id = ? AND brand_id = ?").run(JSON.stringify(c), c.updatedAt, campaignId, brandId);
    return c;
  });
}
