"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { thumb } from "@/lib/thumb";
import type { BrandBrain } from "@/lib/types";

/**
 * The Brand Kit — the whole brand identity rendered AT THE TOP OF THE CANVAS (not a
 * slide-over): logo, tagline, colour palette, typography, mood, voice, photography
 * signature, real imagery. Everything the studio knows, laid out as a document header
 * that the generated shoots stack beneath. Monochrome/Apple-grade per the design
 * system — the brand's OWN colours appear only as palette swatches (content, not chrome).
 * Collapsible so the founder can review it once and then focus on the work.
 */

const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : Boolean(v));

// A comma/slash-separated list of short words → render as chips; a real sentence → paragraph.
function asChips(s: string): string[] | null {
  const parts = s.split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every((p) => p.length <= 22 && !/\.\s/.test(p))) return parts.slice(0, 10);
  return null;
}

export function BrandKitCard({ brain }: { brain: BrandBrain }) {
  const [open, setOpen] = useState(true);
  const intel = brain.intelligence ?? {};
  const r = brain.research ?? {};

  const name = brain.name || "Your brand";
  const logo = intel.logo || r.logo;
  const site = (intel.website || r.website || brain.website || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const meta = [site, brain.category].filter(has).join(" · ");
  const tagline = r.essence || intel.positioning || intel.purpose || "";
  const description = intel.overview || r.summary || intel.story || "";
  const palette = ((intel.palette?.length ? intel.palette : r.palette) ?? []).slice(0, 8);
  const typo = intel.typography;
  const mood = ((intel.personality?.length ? intel.personality : intel.values) ?? []).slice(0, 8);
  const voice = intel.toneOfVoice || r.voice || "";
  const voiceChips = voice ? asChips(voice) : null;
  const vibe = intel.photographyStyle || intel.visualIdentity || r.aesthetic || "";
  const images = Array.from(new Set([...(brain.catalog?.flatMap((p) => p.images ?? []) ?? []), ...(r.productImages ?? [])])).filter(Boolean).slice(0, 6);

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-canvas">
      {/* Header — always visible */}
      <div className="flex items-start gap-4 px-6 py-5">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-md border border-hairline object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Brand kit</div>
          <div className="mt-0.5 font-serif text-[26px] font-light leading-tight tracking-tight text-ink">{name}</div>
          {meta && <div className="mt-0.5 text-[12px] text-muted">{meta}</div>}
          {has(tagline) && <p className="mt-2 text-[14px] italic leading-relaxed text-ink">“{tagline}”</p>}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:text-ink" title={open ? "Collapse" : "Expand"}>
          <ChevronDown size={18} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-6 px-6 pb-6">
          {has(description) && <p className="max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p>}

          {palette.length > 0 && (
            <Kit label="Colour palette">
              <div className="flex flex-wrap gap-3">
                {palette.map((c, i) => (
                  <div key={i} className="w-16">
                    <div className="h-16 w-16 rounded-md border border-hairline" style={{ background: c.hex }} />
                    <div className="mt-1.5 text-[10px] uppercase tracking-wide text-ink">{c.hex}</div>
                    {c.role && <div className="text-[10px] text-muted">{c.role}</div>}
                  </div>
                ))}
              </div>
            </Kit>
          )}

          {typo && (has(typo.display) || has(typo.text) || has(typo.note)) && (
            <Kit label="Typography">
              <div className="space-y-3">
                {has(typo.display) && (
                  <div className="flex items-baseline gap-4">
                    <span className="font-serif text-3xl font-light tracking-tight text-ink">Aa</span>
                    <span className="text-[13px] text-ink">{typo.display}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">Display</span>
                  </div>
                )}
                {has(typo.text) && (
                  <div className="flex items-baseline gap-4 border-t border-hairline pt-3">
                    <span className="text-2xl text-ink">Aa</span>
                    <span className="text-[13px] text-ink">{typo.text}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">Text</span>
                  </div>
                )}
                {has(typo.note) && <p className="text-[13px] leading-relaxed text-muted">{typo.note}</p>}
              </div>
            </Kit>
          )}

          {mood.length > 0 && <Kit label="Mood"><Chips items={mood} /></Kit>}

          {has(voice) && (
            <Kit label="Voice">
              {voiceChips ? <Chips items={voiceChips} /> : <p className="text-[14px] leading-relaxed text-ink">{voice}</p>}
            </Kit>
          )}

          {has(vibe) && <Kit label="Visual signature"><p className="max-w-2xl text-[14px] leading-relaxed text-ink">{vibe}</p></Kit>}

          {images.length > 0 && (
            <Kit label="Images & products">
              <div className="flex flex-wrap gap-2">
                {images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={thumb(src, 160)} alt="" loading="lazy" decoding="async" className="h-16 w-16 rounded-md border border-hairline object-cover" />
                ))}
              </div>
            </Kit>
          )}

          {(site || intel.instagram || r.instagram) && (
            <div className="flex flex-wrap gap-4 border-t border-hairline pt-4 text-[13px]">
              {site && <a href={`https://${site}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink underline-offset-2 hover:underline">{site}<ExternalLink size={12} className="text-muted" /></a>}
              {(intel.instagram || r.instagram) && (() => { const ig = (intel.instagram || r.instagram)!.replace(/^@/, ""); return <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink underline-offset-2 hover:underline">@{ig}<ExternalLink size={12} className="text-muted" /></a>; })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-hairline pt-5">
      <div className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => (
        <span key={i} className="rounded-full bg-surface px-3 py-1 text-[13px] text-ink">{it}</span>
      ))}
    </div>
  );
}
