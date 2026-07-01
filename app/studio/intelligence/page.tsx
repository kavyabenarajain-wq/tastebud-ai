"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { useStudio } from "@/components/tastebud/StudioSession";
import type { BrandIntelligence } from "@/lib/types";

/**
 * STEP 4 — Brand Intelligence.
 * The permanent Brand Brain, laid out like an editorial dossier. Everything the AI
 * learned, articulated the way a creative director would brief it. Every field is
 * guarded, so a thin research pass still reads as intentional.
 */

const has = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null);

/** Repair tiny Shopify favicon-sized logos saved before the harvest fix (?width=32 → width=480). */
const bigLogo = (url?: string): string | undefined => {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (/\/cdn\/shop\/|cdn\.shopify|\/cdn\//.test(u.href)) {
      u.searchParams.delete("crop");
      u.searchParams.delete("height");
      u.searchParams.set("width", "480");
    }
    return u.toString();
  } catch {
    return url;
  }
};

export default function Intelligence() {
  const router = useRouter();
  const { brain, hydrated } = useStudio();

  useEffect(() => {
    if (hydrated && !brain.name) router.replace("/studio");
  }, [hydrated, brain.name, router]);

  const intel: BrandIntelligence = brain.intelligence ?? {};
  const productCount = brain.catalog?.length ?? 0;

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={4} />

      <div className="mx-auto w-full max-w-4xl px-6 pb-40">
        {/* Hero */}
        <Reveal>
          <div className="border-b border-hairline py-14">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
              <Sparkles size={13} /> Your Brand Brain
            </div>
            <h1 className="mt-4 font-serif text-5xl font-light leading-[1.03] tracking-tight text-ink md:text-7xl">{brain.name}</h1>
            {has(intel.positioning) && <p className="mt-6 max-w-2xl font-serif text-xl font-light italic leading-snug text-ink md:text-2xl">“{intel.positioning}”</p>}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
              {brain.category && <span>{brain.category}</span>}
              {intel.website && <a href={intel.website.startsWith("http") ? intel.website : `https://${intel.website}`} target="_blank" rel="noreferrer" className="text-ink underline-offset-2 hover:underline">{intel.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>}
              {intel.instagram && <span>{intel.instagram.startsWith("@") ? intel.instagram : `@${intel.instagram.replace(/^@/, "")}`}</span>}
              {typeof intel.sources === "number" && intel.sources > 0 && <span>{intel.sources} sources</span>}
              {intel.inferred && <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px]">inferred</span>}
            </div>
          </div>
        </Reveal>

        {has(intel.overview) && (
          <Section kicker="Overview">
            <p className="max-w-2xl text-[17px] leading-relaxed text-ink">{intel.overview}</p>
          </Section>
        )}

        {(has(intel.purpose) || has(intel.mission) || has(intel.vision)) && (
          <Section kicker="Purpose · Mission · Vision">
            <div className="grid gap-8 md:grid-cols-3">
              {[["Purpose", intel.purpose], ["Mission", intel.mission], ["Vision", intel.vision]].map(([l, v]) => has(v) && (
                <div key={l as string}>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{l}</div>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink">{v as string}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {has(intel.story) && (
          <Section kicker="Brand Story">
            <p className="max-w-2xl text-[16px] leading-relaxed text-ink">{intel.story}</p>
          </Section>
        )}

        {has(intel.values) && (
          <Section kicker="Core Values">
            <div className="flex flex-wrap gap-2">
              {intel.values!.map((v) => <span key={v} className="rounded-full border border-hairline px-3.5 py-1.5 text-[14px] text-ink">{v}</span>)}
            </div>
          </Section>
        )}

        {(has(intel.audience) || has(intel.persona)) && (
          <Section kicker="Who it's for">
            <div className="grid gap-8 md:grid-cols-2">
              {has(intel.audience) && <div><div className="text-[11px] uppercase tracking-wide text-muted">Target Audience</div><p className="mt-2 text-[15px] leading-relaxed text-ink">{intel.audience}</p></div>}
              {has(intel.persona) && <div><div className="text-[11px] uppercase tracking-wide text-muted">Customer Persona</div><p className="mt-2 text-[15px] leading-relaxed text-ink">{intel.persona}</p></div>}
            </div>
          </Section>
        )}

        {(has(intel.toneOfVoice) || has(intel.personality)) && (
          <Section kicker="Voice & Personality">
            <div className="grid gap-8 md:grid-cols-2">
              {has(intel.toneOfVoice) && <div><div className="text-[11px] uppercase tracking-wide text-muted">Tone of Voice</div><p className="mt-2 text-[15px] leading-relaxed text-ink">{intel.toneOfVoice}</p></div>}
              {has(intel.personality) && (
                <div><div className="text-[11px] uppercase tracking-wide text-muted">Brand Personality</div>
                  <div className="mt-2 flex flex-wrap gap-2">{intel.personality!.map((p) => <span key={p} className="rounded-full bg-surface px-3 py-1 text-[13px] text-ink">{p}</span>)}</div>
                </div>
              )}
            </div>
          </Section>
        )}

        {has(intel.palette) && (
          <Section kicker="Colour Palette">
            <div className="flex flex-wrap gap-4">
              {intel.palette!.map((c, i) => (
                <div key={i} className="w-24">
                  <div className="h-24 w-24 rounded-card border border-hairline" style={{ background: c.hex }} />
                  <div className="mt-2 text-[12px] uppercase tracking-wide text-ink">{c.hex}</div>
                  {c.role && <div className="text-[11px] text-muted">{c.role}</div>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {has(intel.typography) && (has(intel.typography!.display) || has(intel.typography!.text) || has(intel.typography!.note)) && (
          <Section kicker="Typography">
            <div className="space-y-6">
              {has(intel.typography!.display) && (
                <div><div className="text-[11px] uppercase tracking-wide text-muted">Display</div>
                  <div className="mt-1 font-serif text-4xl font-light tracking-tight text-ink">{intel.typography!.display}</div>
                </div>
              )}
              {has(intel.typography!.text) && (
                <div><div className="text-[11px] uppercase tracking-wide text-muted">Text</div>
                  <div className="mt-1 text-2xl text-ink">{intel.typography!.text}</div>
                </div>
              )}
              {has(intel.typography!.note) && <p className="max-w-2xl text-[14px] leading-relaxed text-muted">{intel.typography!.note}</p>}
            </div>
          </Section>
        )}

        {(has(intel.logo) || has(intel.logoSystem)) && (
          <Section kicker="Logo System">
            <div className="flex flex-wrap items-center gap-8">
              {has(intel.logo) && (
                <div className="flex h-28 w-44 items-center justify-center rounded-card border border-hairline bg-surface p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bigLogo(intel.logo)}
                    alt={`${brain.name} logo`}
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                  />
                </div>
              )}
              {has(intel.logoSystem) && <p className="max-w-md text-[15px] leading-relaxed text-ink">{intel.logoSystem}</p>}
            </div>
          </Section>
        )}

        {(has(intel.photographyStyle) || has(intel.packagingStyle) || has(intel.visualIdentity)) && (
          <Section kicker="Visual Identity">
            <div className="space-y-7">
              {[["Photography Style", intel.photographyStyle], ["Packaging Style", intel.packagingStyle], ["Design System", intel.visualIdentity]].map(([l, v]) => has(v) && (
                <div key={l as string}>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{l}</div>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink">{v as string}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {has(intel.competitors) && (
          <Section kicker="Competitor Snapshot">
            <div className="divide-y divide-hairline border-y border-hairline">
              {intel.competitors!.map((c, i) => (
                <div key={i} className="flex items-baseline gap-4 py-3.5">
                  <span className="min-w-[9rem] font-serif text-lg font-light text-ink">{c.name}</span>
                  {c.note && <span className="text-[14px] leading-relaxed text-muted">{c.note}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {has(intel.social) && (
          <Section kicker="Social Presence">
            <div className="grid gap-4 sm:grid-cols-2">
              {intel.social!.map((s, i) => (
                <div key={i} className="rounded-card border border-hairline p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium text-ink">{s.platform}</span>
                    {s.handle && <span className="text-[13px] text-muted">{s.handle.startsWith("@") ? s.handle : `@${s.handle.replace(/^@/, "")}`}</span>}
                  </div>
                  {s.note && <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.note}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {has(intel.press) && (
          <Section kicker="Press & Perception">
            <ul className="space-y-3">
              {intel.press!.map((p, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="text-[15px] leading-relaxed text-ink">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{p.title}</a> : p.title}</span>
                  {p.source && <span className="text-[13px] text-muted">— {p.source}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {has(intel.insights) && (
          <Section kicker="Key Insights">
            <ol className="space-y-4">
              {intel.insights!.map((ins, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-serif text-2xl font-light leading-none text-hairline">{String(i + 1).padStart(2, "0")}</span>
                  <p className="max-w-2xl text-[16px] leading-relaxed text-ink">{ins}</p>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* CTA */}
        <Reveal>
          <div className="mt-16 flex flex-col items-start gap-6 rounded-card border border-hairline bg-surface p-9 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-serif text-2xl font-light tracking-tight text-ink">This is your Brand Brain.</div>
              <p className="mt-2 text-[15px] text-muted">Saved for everything you make next{productCount > 0 ? ` — and I pulled ${productCount} of your products, ready to shoot.` : "."}</p>
            </div>
            <button
              onClick={() => router.push("/studio/products")}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-7 py-3 text-sm font-medium text-canvas shadow-card transition-opacity duration-300 ease-brand hover:opacity-90"
            >
              {productCount > 0 ? "See your products" : "Continue"} <ArrowRight size={16} />
            </button>
          </div>
        </Reveal>
      </div>
    </main>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Section({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="border-b border-hairline py-12">
        <div className="mb-6 text-[11px] uppercase tracking-wide text-muted">{kicker}</div>
        {children}
      </section>
    </Reveal>
  );
}
