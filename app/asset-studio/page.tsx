"use client";

import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PricingSection } from "@/components/site/PricingSection";
import { CTA } from "@/components/site/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

const CAPABILITIES = [
  { t: "Product photoshoots", d: "Your exact product — label, shape, colour — in scenes a camera would believe." },
  { t: "Model photoshoots", d: "Build a model or bring a reference; the same face carries your whole set." },
  { t: "Campaigns & Meta ads", d: "Copy, typography and placements art-directed from your positioning, not a template." },
  { t: "Stories & carousels", d: "Instagram-native formats, sized and finished, straight from one brief." },
  { t: "4K finishing", d: "A deterministic grade, grain and sharpen pass on everything — export-ready." },
  { t: "Brand memory", d: "Keep, hero or reject any shot. The studio learns your taste and keeps it." },
];

/** ASSET BUILDING — the tool page: what the studio makes; the door to pricing. Light, image-free. */
export default function AssetStudio() {
  return (
    <main className="bg-paper text-carbon">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-36 text-center md:pt-48">
        <Reveal>
          <h1 className="font-edito text-5xl font-light leading-[1] tracking-tight md:text-7xl">
            Every asset your brand needs. From a studio that remembers.
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-8 max-w-xl text-[17px] leading-relaxed text-clay">
            Paste your website once. The studio builds your brand kit, learns your products, and
            then makes whatever you ask — talking to you like a creative director, not a form.
          </p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <CTA href="#pricing" variant="solid" size="lg">See plans &amp; start</CTA>
          <CTA href="/discovery/book" variant="outline" size="lg" arrow={false}>Book a demo</CTA>
        </Reveal>
      </section>

      {/* Capabilities */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <Reveal>
            <h2 className="mb-14 max-w-2xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
              One brief in. Finished work out.
            </h2>
          </Reveal>
          <Stagger className="grid gap-x-10 gap-y-14 md:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <StaggerItem key={c.t}>
                <h2 className="font-edito text-2xl font-light tracking-tight">{c.t}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-clay">{c.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Pricing (there is no separate /pricing page). */}
      <div className="border-t border-linen">
        <PricingSection />
      </div>

      <SiteFooter />
    </main>
  );
}
