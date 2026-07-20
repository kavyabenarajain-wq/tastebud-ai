"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CTA } from "@/components/site/Button";

/**
 * HOME — a short, calm, light editorial site with a layered "reveal" scroll.
 *
 * The intro and the footer are two full "pages" pinned in place behind the content (z-0, sticky);
 * the middle content sits on top (z-10, opaque) and scrolls between them. So the intro is revealed
 * first and the content rises up over it, and at the end the content scrolls up to uncover the
 * footer — it reads as scrolling *above* a footer that was already there.
 *
 * No images. No colour. No labels. Warm paper / cream, ink type.
 */
export default function Home() {
  return (
    <main className="relative bg-cream text-carbon">
      <SiteHeader floatReveal />

      {/* The scrolling content — opaque, painted above the footer. Its one-screen bottom margin is
          the gap the content scrolls up through to uncover the footer that's already sitting behind. */}
      <div className="relative z-[1] mb-[100svh] bg-paper">
        {/* Intro is pinned (sticky) behind the content below; the content rises up over it. */}
        <section className="sticky top-0 z-0 flex h-[100svh] items-center justify-center overflow-hidden bg-paper px-6">
          <Intro />
        </section>
        <div className="relative z-[1] bg-paper">
          <Statement />
          <Method />
        </div>
      </div>

      {/* Footer page — already there underneath (z-[-1]); the content scrolls up above it. */}
      <footer className="fixed inset-x-0 bottom-0 z-[-1] h-[100svh]">
        <FooterPage />
      </footer>
    </main>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;
const SCENE = "flex flex-col justify-center px-6 py-24 md:min-h-[100svh] md:py-20";

/* ── Intro (pinned) ──────────────────────────────────────────────────────────*/
function Intro() {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.9 }}
        className="mb-6 text-[10px] uppercase tracking-[0.35em] text-clay md:mb-8 md:text-[11px] md:tracking-[0.4em]"
      >
        The brand studio
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 24, filter: "blur(16px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1.4, ease: EASE }}
        className="font-edito text-[27vw] font-light leading-[0.85] tracking-tight text-carbon md:text-[15vw]"
      >
        tastebud
      </motion.h1>
    </div>
  );
}

/* ── Statement ───────────────────────────────────────────────────────────────*/
function Statement() {
  return (
    <section className={`${SCENE} bg-cream`}>
      <div className="mx-auto max-w-4xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 1, ease: EASE }}
          className="font-edito text-[2.15rem] font-light leading-[1.06] tracking-tight text-carbon sm:text-5xl md:text-[5.25rem]"
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
          tastebud studies your products, palette and voice — then art-directs photoshoots,
          campaigns and ads that could only be yours.
        </motion.p>
      </div>
    </section>
  );
}

/* ── Method ──────────────────────────────────────────────────────────────────*/
const STEPS = [
  { n: "01", t: "Paste your website", d: "The studio reads your site and builds your brand kit — products, palette, voice." },
  { n: "02", t: "Approve your brand brain", d: "Everything it learned, laid out like a brand book. Correct it once; it remembers." },
  { n: "03", t: "Ask for anything", d: "Product and model shoots, campaigns, ads, stories — finished, on-brand, in minutes." },
];

function Method() {
  return (
    <section className={`${SCENE} bg-paper`}>
      <div className="mx-auto w-full max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9, ease: EASE }}
          className="max-w-2xl font-edito text-[2.15rem] font-light leading-[1.04] tracking-tight text-carbon sm:text-5xl md:text-6xl"
        >
          Three steps, start to finish.
        </motion.h2>

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
          <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <CTA href="/asset-studio#pricing" variant="solid" size="lg" className="w-full justify-center sm:w-auto">Start creating</CTA>
            <CTA href="/discovery/book" variant="outline" size="lg" arrow={false} className="w-full justify-center sm:w-auto">Book a demo</CTA>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-linen pt-6 text-[11px] uppercase tracking-[0.16em] text-clay md:flex-row">
        <span>© 2026 tastebud — studio, not software</span>
        <div className="flex items-center gap-6">
          <Link href="/brand-build" className="transition-colors hover:text-carbon">Brand build</Link>
          <Link href="/asset-studio" className="transition-colors hover:text-carbon">Asset building</Link>
          <Link href="/contact" className="transition-colors hover:text-carbon">Contact</Link>
        </div>
        <Link href="/" className="transition-colors hover:text-carbon">tastebud.studio</Link>
      </div>
    </div>
  );
}
