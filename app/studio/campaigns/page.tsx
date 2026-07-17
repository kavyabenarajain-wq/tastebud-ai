"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Layers, ArrowUpRight } from "lucide-react";
import { WorkBar } from "@/components/tastebud/WorkBar";
import { CREATIVE_TYPES, FORMATS, type FormatId } from "@/lib/creativeTypes";
import type { BrandBrain, Campaign } from "@/lib/types";

/**
 * The campaign library — everything a brand has produced through the v2 creative
 * types (ad campaigns, carousels, Instagram creatives, stories), grouped the way
 * brushless groups a brief's deliverables: one container per brief, copy + every
 * placement/frame together. Read-only here; the work happens in /studio/create.
 */

const slugify = (name: string): string =>
  (name || "brand").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brand";

const displaySrc = (url: string, w = 480): string =>
  url.startsWith("/api/img/") ? `${url}${url.includes("?") ? "&" : "?"}w=${w}` : url;

const when = (iso?: string): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};

export default function CampaignsPage() {
  const router = useRouter();
  const [brand, setBrand] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let name = "";
    try {
      const raw = localStorage.getItem("cc.activeBrand");
      if (raw) name = (JSON.parse(raw) as BrandBrain).name ?? "";
    } catch {
      /* ignore */
    }
    if (!name) {
      router.replace("/studio");
      return;
    }
    setBrand(name);
    loadCampaigns(name);
  }, [router]);

  // Kept out of the effect so the error state can offer a real "Retry" — a failed load must not
  // masquerade as "no campaigns yet" (which would tell a brand with campaigns it has none).
  function loadCampaigns(name: string) {
    setLoadError(false);
    setCampaigns(null);
    fetch(`/api/campaigns/${slugify(name)}`)
      .then((r) => r.json())
      .then((j) => setCampaigns(j.campaigns ?? []))
      .catch(() => { setLoadError(true); setCampaigns([]); });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <WorkBar brand={brand} back="/studio/create" backLabel="Studio" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <h1 className="font-serif text-3xl font-light tracking-tight md:text-4xl">Campaigns</h1>
        <p className="mt-1 text-[15px] text-muted">Every ad campaign, carousel and creative this brand has produced — copy and every placement, together.</p>

        {campaigns === null ? (
          <div className="mt-8 space-y-6" aria-busy="true" aria-label="Loading campaigns">
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse rounded-card border border-hairline bg-canvas p-5">
                <div className="h-4 w-40 rounded bg-surface" />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="aspect-[4/5] rounded bg-surface" />
                  <div className="aspect-[4/5] rounded bg-surface" />
                  <div className="aspect-[4/5] rounded bg-surface" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="mt-10 flex flex-col items-center rounded-card border border-dashed border-hairline py-16 text-center">
            <Layers size={24} strokeWidth={1.5} className="text-muted" />
            <p className="mt-3 max-w-sm text-sm text-muted">Couldn&rsquo;t load your campaigns just now.</p>
            <button onClick={() => loadCampaigns(brand)} className="mt-5 rounded-control bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90">
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-card border border-dashed border-hairline py-16 text-center">
            <Layers size={24} strokeWidth={1.5} className="text-muted" />
            <p className="mt-3 max-w-sm text-sm text-muted">No campaigns yet. Generate an ad campaign, a carousel or an Instagram creative and it lands here automatically.</p>
            <button onClick={() => router.push("/studio/create?type=ad")} className="mt-5 rounded-control bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90">
              Make your first campaign
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {campaigns.map((c, i) => (
              <motion.section
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: Math.min(i * 0.04, 0.2) }}
                className="rounded-card border border-hairline bg-canvas p-5"
              >
                <div className="flex items-baseline gap-2.5">
                  <h2 className="truncate text-[17px] font-medium tracking-[-0.01em]">{c.name}</h2>
                  <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">{CREATIVE_TYPES[c.type]?.runLabel ?? c.type}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-muted">{when(c.updatedAt)}</span>
                </div>
                {(c.copy?.headline || c.copy?.caption) && (
                  <div className="mt-2">
                    {c.copy?.headline && <div className="text-[14px] font-medium tracking-tight">{c.copy.headline}</div>}
                    <div className="mt-1 flex items-baseline gap-2.5">
                      {c.copy?.cta && <span className="shrink-0 rounded-full border border-ink px-2.5 py-0.5 text-[11px]">{c.copy.cta}</span>}
                      {c.copy?.caption && <span className="text-[12px] leading-relaxed text-muted">{c.copy.caption}</span>}
                    </div>
                  </div>
                )}
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {c.outputs.map((o) => (
                    <a key={o.id} href={o.url} target="_blank" rel="noreferrer" className="group relative block h-32 shrink-0 overflow-hidden rounded-md border border-hairline bg-surface" style={{ aspectRatio: o.aspect ? o.aspect.replace(":", "/") : "4/5" }} title={o.angle}>
                      <img src={displaySrc(o.url)} alt={o.angle ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover transition-opacity group-hover:opacity-90" />
                      {(o.format || typeof o.seq === "number") && (
                        <span className="absolute left-1.5 top-1.5 rounded-full border border-hairline bg-canvas/90 px-1.5 py-0.5 text-[9px] text-ink">
                          {typeof o.seq === "number" ? o.seq : FORMATS[o.format as FormatId]?.short ?? o.format}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
                  <span>{c.outputs.length} asset{c.outputs.length === 1 ? "" : "s"}{c.brief ? ` · “${c.brief.slice(0, 80)}${c.brief.length > 80 ? "…" : ""}”` : ""}</span>
                  <button onClick={() => router.push(`/studio/create?type=${c.type}`)} className="flex items-center gap-1 text-muted transition-colors hover:text-ink">
                    Continue in studio <ArrowUpRight size={12} />
                  </button>
                </div>
              </motion.section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
