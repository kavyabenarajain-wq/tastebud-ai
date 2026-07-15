"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import type { BrandBrain } from "@/lib/types";

/**
 * The Brand Brain — a slide-over that surfaces EVERYTHING the studio knows about the
 * loaded brand: who they are, their researched palette, their photography signature,
 * their world (competitors, faces, links) and their real harvested imagery. Opened
 * from the workspace banner so the brand context is always one tap away.
 */
export function BrandBrainPanel({ brain, open, onClose }: { brain: BrandBrain; open: boolean; onClose: () => void }) {
  const r = brain.research;
  const intel = brain.intelligence;
  const ease = [0.4, 0, 0.2, 1] as const;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} className="fixed inset-0 z-40 bg-ink/20"
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.3, ease }}
            className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[90vw] flex-col border-l border-hairline bg-canvas"
          >
            <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <span className="text-[11px] uppercase tracking-wide text-muted">Brand brain</span>
              <button onClick={onClose} className="text-muted transition-opacity hover:opacity-60" aria-label="Close"><X size={18} /></button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div>
                <div className="font-serif text-3xl font-light tracking-tight text-ink">{brain.name || "Brand"}</div>
                {r?.essence && <p className="mt-2 text-[15px] leading-relaxed text-ink">{r.essence}</p>}
                {r?.voice && <p className="mt-1 text-[13px] text-muted">Voice: {r.voice}</p>}
              </div>

              {(r?.palette?.length ?? 0) > 0 && (
                <Section label="Palette">
                  <div className="flex flex-wrap gap-1.5">
                    {r!.palette!.map((p, i) => (
                      <span key={i} title={`${p.hex}${p.role ? ` · ${p.role}` : ""}`} className="h-8 w-8 rounded-md border border-hairline" style={{ background: p.hex }} />
                    ))}
                  </div>
                </Section>
              )}

              <Fld label="Category" v={brain.category} />
              <Fld label="Audience" v={brain.audience} />
              <Fld label="Vibe" v={brain.vibe} />
              <Fld label="Product" v={brain.productType} />
              <Fld label="Purpose" v={brain.purpose} />
              <Fld label="Ideology" v={brain.ideology} />

              {r?.aesthetic && (
                <Section label="Photography signature">
                  <p className="text-[14px] leading-relaxed text-ink">{r.aesthetic}</p>
                </Section>
              )}

              {(r?.competitors?.length ?? 0) > 0 && (
                <Section label="In their space"><Chips items={r!.competitors!} /></Section>
              )}
              {(intel?.ambassadors?.length ?? 0) > 0 ? (
                <Section label="Faces / ambassadors">
                  <div className="flex flex-col gap-1.5 text-[13px]">
                    {intel!.ambassadors!.slice(0, 10).map((a, i) => (
                      <div key={i}>
                        <span className="text-ink">{a.name}</span>
                        {a.handle ? <span className="text-muted"> {a.handle.startsWith("@") ? a.handle : `@${a.handle}`}</span> : null}
                        {a.note ? <span className="text-muted"> — {a.note}</span> : null}
                      </div>
                    ))}
                  </div>
                </Section>
              ) : (r?.ambassadors?.length ?? 0) > 0 ? (
                <Section label="Faces / ambassadors"><Chips items={r!.ambassadors!} /></Section>
              ) : null}

              {(intel?.campaigns?.length ?? 0) > 0 && (
                <Section label="Past campaigns">
                  <div className="flex flex-col gap-3">
                    {intel!.campaigns!.slice(0, 8).map((c, i) => (
                      <div key={i} className="text-[13px] leading-relaxed">
                        <div className="text-ink">{c.title}{c.year ? ` · ${c.year}` : ""}{c.channel ? <span className="text-muted"> · {c.channel}</span> : null}</div>
                        {c.description && <div className="text-muted">{c.description}{c.fronted ? ` — ${c.fronted}` : ""}</div>}
                        {c.url && <div className="mt-0.5"><Link href={c.url} label="view" /></div>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {(intel?.socialProof?.length ?? 0) > 0 && (
                <Section label="Social proof">
                  <div className="flex flex-col gap-2 text-[13px] text-muted">
                    {intel!.socialProof!.slice(0, 8).map((p, i) => (
                      <div key={i}>{p.type ? <span className="text-ink">{p.type}: </span> : null}{p.text}{p.url ? <> · <Link href={p.url} label="source" /></> : null}</div>
                    ))}
                  </div>
                </Section>
              )}

              {(r?.instagram || r?.website) && (
                <Section label="Links">
                  <div className="flex flex-col gap-1.5 text-[14px]">
                    {r?.website && <Link href={r.website} label={r.website.replace(/^https?:\/\//, "")} />}
                    {r?.instagram && <Link href={`https://instagram.com/${r.instagram.replace(/^@/, "")}`} label={r.instagram.startsWith("@") ? r.instagram : `@${r.instagram}`} />}
                  </div>
                </Section>
              )}

              {(r?.productImages?.length ?? 0) > 0 && (
                <Section label="Their real imagery">
                  <div className="grid grid-cols-3 gap-2">
                    {r!.productImages!.slice(0, 9).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded-md border border-hairline object-cover" />
                    ))}
                  </div>
                </Section>
              )}

              {r?.summary && (
                <Section label="Summary"><p className="text-[14px] leading-relaxed text-muted">{r.summary}</p></Section>
              )}

              {!r && <p className="text-[14px] leading-relaxed text-muted">No research saved for this brand yet.</p>}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

function Fld({ label, v }: { label: string; v?: string }) {
  if (!v) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[14px] leading-snug text-ink">{v}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="rounded-full border border-hairline px-3 py-1 text-[13px] text-ink">{it}</span>
      ))}
    </div>
  );
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink underline-offset-2 hover:underline">
      {label} <ExternalLink size={13} className="text-muted" />
    </a>
  );
}
