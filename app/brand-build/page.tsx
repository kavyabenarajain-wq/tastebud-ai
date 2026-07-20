"use client";

import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CTA } from "@/components/site/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

const DELIVERABLES = [
  { k: "01", t: "World & positioning", d: "Who you are, who it's for, and the one idea everything hangs on — written down, argued for, yours." },
  { k: "02", t: "Palette & typography", d: "Sampled from your actual product, never an invented moodboard. Colour and type that survive reality." },
  { k: "03", t: "Voice & story", d: "How the brand speaks — on a label, in an ad, in a caption. A voice you can hand to anyone." },
  { k: "04", t: "A living brand brain", d: "Everything above loaded into the studio, so every future asset starts already on-brand." },
];

const PROCESS = [
  { n: "01", t: "A conversation", d: "One call. Where you are, what you make, where it should go." },
  { n: "02", t: "A direction", d: "We come back with the world — references, palette, type, voice — and refine it with you." },
  { n: "03", t: "A brand, live", d: "The finished kit lands in your studio, ready to make its first campaign that day." },
];

/** BRAND BUILD — the service page, light editorial. */
export default function BrandBuild() {
  return (
    <main className="bg-paper text-carbon">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-24 pt-36 text-center md:pt-48">
        <Reveal>
          <h1 className="font-edito text-5xl font-light leading-[1] tracking-tight md:text-7xl">
            Don&rsquo;t have a brand yet? We&rsquo;ll build it with you.
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-8 max-w-xl text-[17px] leading-relaxed text-clay">
            Brand build is a working engagement, not a template. We shape the world, the palette,
            the type and the voice — then load it all into the studio so the assets never drift off-brand.
          </p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10">
          <CTA href="/discovery/book" variant="solid" size="lg">Start with a conversation</CTA>
        </Reveal>
      </section>

      {/* Deliverables */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <Reveal>
            <h2 className="max-w-2xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
              What you walk away with.
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

      {/* Process */}
      <section className="border-t border-linen">
        <div className="mx-auto max-w-5xl px-6 py-24">
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
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <Reveal>
            <h2 className="font-edito text-4xl font-light tracking-tight md:text-6xl">Start with a conversation.</h2>
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-clay">
              Tell us what you&rsquo;re making. We&rsquo;ll tell you what the brand could be.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <CTA href="/discovery/book" variant="solid" size="lg">Book a demo</CTA>
              <CTA href="/asset-studio#pricing" variant="outline" size="lg" arrow={false}>Try the studio</CTA>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
