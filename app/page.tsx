"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CTA } from "@/components/site/Button";
import { Reveal } from "@/components/site/motion";

/**
 * HOME — a calm, light/dark editorial site with a layered "reveal" scroll. No images: warm paper
 * / ink, type only, with the reveal footer underneath.
 *
 * The intro and the footer are two full "pages" pinned in place behind the content (z-0 sticky /
 * z-[-1] fixed); the middle content sits on top (opaque) and scrolls between them. The page leads
 * with Brand Discovery (live) and treats Asset Studio as coming-soon.
 */
export default function Home() {
  return (
    <main className="relative bg-cream text-carbon">
      <SiteHeader floatReveal />

      <div className="relative z-[1] mb-[100svh] bg-paper">
        <section className="sticky top-0 z-0 flex h-[100svh] items-center justify-center overflow-hidden bg-paper px-6">
          <Intro />
        </section>
        <div className="relative z-[1] bg-paper">
          <Statement />
          <Offerings />
          <Method />
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-[-1] h-[100svh]">
        <FooterPage />
      </footer>
    </main>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;
const SCENE = "flex flex-col justify-center px-6 py-24 md:min-h-[100svh] md:py-28";

/* ── Intro (pinned) ──────────────────────────────────────────────────────────*/
function Intro() {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 24, filter: "blur(16px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1.4, ease: EASE }}
        className="font-edito text-[18vw] font-light leading-[0.9] tracking-tight text-accent md:text-[12vw]"
      >
        ai.tastebud
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5, ease: EASE }}
        className="mt-6 max-w-md text-[15px] leading-relaxed text-clay md:mt-8 md:text-[18px]"
      >
        Taste-first, AI-powered creative co-pilot
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.65, ease: EASE }}
        className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
      >
        <CTA href="/discovery/book" variant="solid" size="lg">Book a discovery call</CTA>
        <CTA href="/brand-discovery" variant="outline" size="lg" arrow={false}>How it works</CTA>
      </motion.div>
    </div>
  );
}

/* ── Statement — the thesis ───────────────────────────────────────────────────*/
function Statement() {
  return (
    <section className={`${SCENE} bg-cream`}>
      <div className="mx-auto max-w-4xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 1, ease: EASE }}
          className="font-edito text-[2.15rem] font-light leading-[1.06] tracking-tight text-carbon sm:text-5xl md:text-[5rem]"
        >
          A studio that already knows your brand.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.9, delay: 0.12, ease: EASE }}
          className="mx-auto mt-7 max-w-md text-[15px] leading-relaxed text-clay md:mt-9 md:max-w-xl md:text-[17px]"
        >
          tastebud studies your products, palette and voice — then art-directs the work so
          everything looks unmistakably, deliberately yours.
        </motion.p>
      </div>
    </section>
  );
}

/* ── Offerings — the two paths: Brand Discovery (live) + Asset Studio (soon) ───*/
function Offerings() {
  return (
    <section className={`${SCENE} bg-paper`}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <h2 className="max-w-2xl font-edito text-[2.15rem] font-light leading-[1.04] tracking-tight text-carbon sm:text-5xl md:text-6xl">
            Two ways in.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 md:gap-6">
          <OfferingCard
            tag="Live now"
            title="Brand Discovery"
            body="One focused call, and we build your brand with you — world, palette, type, voice — then hand it over as a living brand brain you can run a company on."
            cta="Book a discovery call"
            href="/discovery/book"
            secondaryLabel="What you get"
            secondaryHref="/brand-discovery"
            live
          />
          <OfferingCard
            tag="Coming soon"
            title="Asset Studio"
            body="A self-serve studio that remembers your brand and makes every asset on-brand in minutes — product shoots, model shoots, campaigns and Meta ads."
            cta="See what's coming"
            href="/asset-studio"
          />
        </div>
      </div>
    </section>
  );
}

function OfferingCard({
  tag,
  title,
  body,
  cta,
  href,
  secondaryLabel,
  secondaryHref,
  live = false,
}: {
  tag: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  live?: boolean;
}) {
  return (
    <Reveal className="group flex h-full flex-col rounded-[18px] border border-linen bg-cream p-8 transition-colors duration-500 hover:border-carbon/20 md:p-10">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-linen px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-clay">
        {live && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        {tag}
      </span>
      <h3 className="mt-8 font-edito text-4xl font-light tracking-tight text-carbon md:text-5xl">{title}</h3>
      <p className="mt-4 flex-1 text-[15px] leading-relaxed text-clay md:text-[16px]">{body}</p>
      <div className="mt-9 flex flex-wrap items-center gap-4">
        <CTA href={href} variant="solid" size="md">{cta}</CTA>
        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-carbon transition-transform duration-300 hover:translate-x-0.5"
          >
            {secondaryLabel} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </Reveal>
  );
}

/* ── Method — three steps ─────────────────────────────────────────────────────*/
const STEPS = [
  { n: "01", t: "We learn your brand", d: "On one call — or straight from your site — we read your products, palette and voice, and write it all down." },
  { n: "02", t: "You approve the brain", d: "Everything we learned, laid out like a brand book. Correct it once; the studio remembers it forever." },
  { n: "03", t: "We make the work", d: "Product and model shoots, campaigns, ads and stories — finished, on-brand, and unmistakably yours." },
];

function Method() {
  return (
    <section className={`${SCENE} bg-cream`}>
      <div className="mx-auto w-full max-w-5xl">
        <Reveal>
          <h2 className="max-w-2xl font-edito text-[2.15rem] font-light leading-[1.04] tracking-tight text-carbon sm:text-5xl md:text-6xl">
            Three steps, start to finish.
          </h2>
        </Reveal>

        <div className="mt-10 border-t border-linen md:mt-14">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8%" }}
              transition={{ duration: 0.7, delay: i * 0.08, ease: EASE }}
              className="group grid grid-cols-1 gap-y-2 border-b border-linen py-7 md:grid-cols-12 md:items-baseline md:gap-8 md:py-8"
            >
              <div className="flex items-baseline gap-4 md:col-span-7 md:gap-5">
                <span className="font-edito text-base italic text-clay md:text-lg">{s.n}</span>
                <h3 className="font-edito text-[1.7rem] font-light leading-tight tracking-tight text-carbon transition-transform duration-500 ease-brand group-hover:translate-x-1.5 md:text-[2.5rem]">
                  {s.t}
                </h3>
              </div>
              <p className="pl-8 text-[14.5px] leading-relaxed text-clay md:col-span-5 md:pl-0 md:text-[15px]">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Footer page (pinned) — the final CTA + footer, revealed from underneath ──*/
function FooterPage() {
  return (
    <div className="flex h-full flex-col bg-cream px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-1 items-center justify-center">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h2 className="font-edito text-[2.4rem] font-light leading-[1.02] tracking-tight text-carbon sm:text-6xl md:text-[5.5rem]">
            Make something only you could.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-clay md:text-[17px]">
            Book a 30-minute discovery call and walk away with a brand you can build on.
          </p>
          <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <CTA href="/discovery/book" variant="solid" size="lg" className="w-full justify-center sm:w-auto">Book a discovery call</CTA>
            <CTA href="/brand-discovery" variant="outline" size="lg" arrow={false} className="w-full justify-center sm:w-auto">Explore Brand Discovery</CTA>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-linen pt-6 text-[11px] uppercase tracking-[0.16em] text-clay md:flex-row">
        <span>© 2026 tastebud — studio, not software</span>
        <div className="flex items-center gap-6">
          <Link href="/brand-discovery" className="transition-colors hover:text-carbon">Brand Discovery</Link>
          <Link href="/asset-studio" className="transition-colors hover:text-carbon">Asset Studio</Link>
          <Link href="/contact" className="transition-colors hover:text-carbon">Contact</Link>
        </div>
        <Link href="/" className="transition-colors hover:text-carbon">aitastebud.com</Link>
      </div>
    </div>
  );
}
