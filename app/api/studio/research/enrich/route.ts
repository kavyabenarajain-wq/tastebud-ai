import type { NextRequest } from "next/server";
import { enrichIntelligence, mergeEnrichment, type IntelligenceEnrichment } from "@/lib/research";
import { saveBrain, getBrain, slugify } from "@/lib/brainStore";
import { DEFAULT_ACCOUNT } from "@/lib/store";
import { currentAccount } from "@/lib/supabase/account";
import type { BrandBrain, BrandIntelligence } from "@/lib/types";

export const runtime = "nodejs";
// The deep pass reaches the live web (Instagram, press, Reddit, Meta Ad Library) so it's slower than
// the fast dossier — but it runs AFTER the brand book is already on screen, so latency is invisible.
export const maxDuration = 60;

/**
 * Progressive DEEP enrichment for the brand book. Called by the studio once the fast research is on
 * screen: it runs the live-web pass (campaigns, ambassadors, social proof, press, community
 * sentiment), merges the findings onto the saved brain, and returns them so the book fills in live.
 * Best-effort — returns an empty enrichment (never an error) when no web-search key is set.
 */
export async function POST(req: NextRequest) {
  const { brain } = (await req.json().catch(() => ({}))) as { brain?: BrandBrain };
  const empty: IntelligenceEnrichment = { campaigns: [], ambassadors: [], socialProof: [], press: [], insights: [] };
  if (!brain?.name?.trim()) return Response.json({ enrichment: empty, intelligence: brain?.intelligence ?? {} });

  const account = await currentAccount();
  try {
    // Prefer the freshest STORED brain (the fast pass just persisted it) so we enrich against the
    // real research. A DB READ ERROR must NOT be mistaken for "brand not found" and silently fall
    // back to the stale client copy (which we'd then re-save) — bail cleanly on a read failure.
    let stored: BrandBrain;
    try {
      stored = (await getBrain(slugify(brain.name), account)) ?? brain;
    } catch {
      return Response.json({ enrichment: empty, intelligence: brain.intelligence ?? {} });
    }
    const base: BrandBrain = { ...brain, ...stored, research: stored.research ?? brain.research, intelligence: stored.intelligence ?? brain.intelligence };

    const enrichment = await enrichIntelligence(base);
    const intelligence: BrandIntelligence = mergeEnrichment(base.intelligence, enrichment);

    // Persist the enrichment onto the brand (saveBrain merges, so research/catalog are preserved).
    try {
      await saveBrain(
        { name: base.name, intelligence } as BrandBrain,
        { origin: "studio", account, email: account !== DEFAULT_ACCOUNT ? account : undefined },
      );
    } catch { /* non-fatal — the client still gets the enrichment to render */ }

    return Response.json({ enrichment, intelligence });
  } catch (err) {
    return Response.json({ enrichment: empty, intelligence: brain.intelligence ?? {}, error: (err as Error).message });
  }
}
