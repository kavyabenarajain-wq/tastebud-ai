"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CTA } from "@/components/site/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

/**
 * BRAND DISCOVERY — the live, human-led service. This is the thing we sell today: one focused
 * call, and we build the brand with you, then hand it over as a living brand brain. Everything
 * routes to /discovery/book. Type-only, fully theme-aware (light + dark).
 */

const DELIVERABLES = [
  { k: "01", t: "World & positioning", d: "Who you are, who it's for, and the one idea everything hangs on — written down, argued for, yours." },
  { k: "02", t: "Palette & typography", d: "Sampled from your actual product, never an invented moodboard. Colour and type that survive reality." },
  { k: "03", t: "Voice & story", d: "How the brand speaks — on a label, in an ad, in a caption. A voice you can hand to anyone." },
  { k: "04", t: "A living brand brain", d: "Everything above loaded into the studio, so every future asset starts already on-brand." },
];

const PROCESS = [
  { n: "01", t: "A conversation", d: "One 30-minute call. Where you are, what you make, and where it should go. Bring everything — or nothing." },
  { n: "02", t: "A direction", d: "We come back with the world — references, palette, type and voice — and refine it together until it's right." },
  { n: "03", t: "A brand, live", d: "The finished kit lands as a brand brain, ready to make its first on-brand campaign that same day." },
];

const CONTAINS = [
  "Purpose", "Mission & vision", "Positioning", "Verbal identity",
  "Logo system", "Colour palette", "Typography", "Art direction",
];

export default function BrandDiscovery() {
  return (
    <main className="bg-paper text-carbon">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-32 text-center md:pb-24 md:pt-48">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-linen px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-clay">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Live now
          </span>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mt-7 font-edito text-5xl font-light leading-[1] tracking-tight md:text-7xl">
            We build your brand with you.
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-8 max-w-xl text-[17px] leading-relaxed text-clay">
            Brand Discovery is a working engagement, not a template. In one focused call we shape
            your world, palette, type and voice — then load it into the studio so nothing ever
            drifts off-brand.
          </p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <CTA href="/discovery/book" variant="solid" size="lg">Book a discovery call</CTA>
          <Link
            href="/discovery"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-carbon transition-transform duration-300 hover:translate-x-0.5"
          >
            See everything you get <ArrowRight size={14} />
          </Link>
        </Reveal>
      </section>

      {/* Deliverables */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.2em] text-clay">What you walk away with</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-4 max-w-2xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
              A complete brand — not a logo and a colour.
            </h2>
          </Reveal>
          <div className="mt-14 border-t border-linen">
            {DELIVERABLES.map((c) => (
              <Reveal key={c.k}>
                <div className="group grid grid-cols-1 gap-3 border-b border-linen py-8 md:grid-cols-12 md:items-baseline md:gap-8">
                  <div className="flex items-baseline gap-5 md:col-span-6">
                    <span className="font-edito text-lg italic text-clay">{c.k}</span>
                    <h3 className="font-edito text-2xl font-light tracking-tight transition-transform duration-500 ease-brand group-hover:translate-x-1.5 md:text-[2rem]">
                      {c.t}
                    </h3>
                  </div>
                  <p className="text-[15px] leading-relaxed text-clay md:col-span-6">{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Everything a brand contains — teaser grid → full page */}
      <section className="border-t border-linen">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Reveal>
              <h2 className="max-w-xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
                Everything a real brand contains.
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <Link
                href="/discovery"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-carbon transition-transform duration-300 hover:translate-x-0.5"
              >
                Walk through it <ArrowRight size={14} />
              </Link>
            </Reveal>
          </div>
          <Stagger className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-linen bg-linen sm:grid-cols-4">
            {CONTAINS.map((c) => (
              <StaggerItem key={c}>
                <div className="flex h-full items-center gap-2.5 bg-paper px-5 py-6 text-[14px] text-carbon transition-colors duration-300 hover:bg-cream">
                  <Check size={14} className="shrink-0 text-accent" />
                  {c}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Process */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <Reveal>
            <h2 className="font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">How it goes.</h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {PROCESS.map((s) => (
              <StaggerItem key={s.n}>
                <span className="font-edito text-lg italic text-clay">{s.n}</span>
                <h3 className="mt-3 font-edito text-2xl font-light tracking-tight">{s.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-clay">{s.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-linen">
        <div className="mx-auto max-w-3xl px-6 py-20 md:py-28 text-center">
          <Reveal>
            <h2 className="font-edito text-4xl font-light tracking-tight md:text-6xl">Start with a conversation.</h2>
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-clay">
              Tell us what you&rsquo;re making. We&rsquo;ll tell you what the brand could be — and build it with you.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <CTA href="/discovery/book" variant="solid" size="lg">Book a discovery call</CTA>
              <CTA href="/asset-studio" variant="outline" size="lg" arrow={false}>See Asset Studio</CTA>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
