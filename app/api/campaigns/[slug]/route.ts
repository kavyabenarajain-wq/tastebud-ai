import type { NextRequest } from "next/server";
import { getCampaigns, saveCampaign } from "@/lib/brainStore";
import type { Campaign } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/campaigns/<slug> → every campaign for the brand, newest first.
// Campaigns that never produced an asset (abandoned generations) are pruned from the list.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const campaigns = (await getCampaigns(params.slug)).filter((c) => (c.outputs ?? []).length > 0);
  return Response.json({ campaigns });
}

// POST /api/campaigns/<slug> → upsert one campaign (rename, copy edit — "change a
// headline and it updates on the spot"). Body: { campaign }. Returns { ok, campaign }.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = (await req.json().catch(() => ({}))) as { campaign?: Campaign };
  if (!body.campaign?.id || !body.campaign?.type) {
    return Response.json({ error: "Bad campaign" }, { status: 400 });
  }
  const campaign = await saveCampaign(params.slug, body.campaign);
  return Response.json({ ok: true, campaign });
}
