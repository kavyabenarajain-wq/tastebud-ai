"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const rise = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
} as const;

/**
 * HOME — the marketing front door.
 * A full-screen "tastebud" intro that animates in and then fades/lifts away as you scroll
 * smoothly into the site; then the headline, the two doors, how-it-works, and the footer.
 */
export default function Home() {
  const introRef = useRef<HTMLElement>(null);
  // Scroll-linked: as the intro scrolls out (one viewport), fade + lift + gently shrink the
  // "tastebud" wordmark so the pure brand screen dissolves into the site rather than cutting.
  const { scrollYProgress } = useScroll({ target: introRef, offset: ["start start", "end start"] });
  const wordOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const wordY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const wordScale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  // The nav is absent on the pure "tastebud" screen and fades in as you scroll into the site.
  const headerOpacity = useTransform(scrollYProgress, [0.55, 0.95], [0, 1]);
  const [navOn, setNavOn] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setNavOn(v > 0.55));

  return (
    <main className="bg-cream text-ink">
      {/* Header hidden on the intro screen; fades in (and becomes clickable) as you enter the site. */}
      <motion.div style={{ opacity: headerOpacity }} className={navOn ? "" : "pointer-events-none"}>
        <SiteHeader />
      </motion.div>

      {/* Intro — a whole screen, nothing but the word. Scroll and the motion carries you in. */}
      <section ref={introRef} className="relative flex h-screen items-center justify-center overflow-hidden px-6 text-center">
        <motion.div style={{ opacity: wordOpacity, y: wordY, scale: wordScale }}>
          <motion.h1
            initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-site-serif text-7xl font-light leading-none tracking-tight text-ink sm:text-8xl md:text-[11rem]"
          >
            tastebud
          </motion.h1>
        </motion.div>
      </section>

      {/* Hero — one headline, held on a clean field. */}
      <section id="start" className="flex min-h-[92vh] scroll-mt-0 flex-col items-center justify-center px-6 pt-28 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-[12px] uppercase tracking-wide text-clay"
        >
          The brand studio
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
          className="mt-6 max-w-4xl font-site-serif text-5xl font-light leading-[1.05] tracking-tight md:text-7xl"
        >
          A studio that already knows your brand.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
          className="mt-7 max-w-xl text-[17px] leading-relaxed text-clay"
        >
          tastebud studies your brand — products, palette, voice — then art-directs
          photoshoots, campaigns and ads that could only be yours.
        </motion.p>
      </section>

      {/* The two doors. */}
      <section className="mx-auto grid max-w-5xl gap-5 px-6 pb-28 md:grid-cols-2">
        <motion.div {...rise}>
          <Link
            href="/discovery/book"
            className="group flex h-full min-h-[380px] flex-col justify-between rounded-3xl border border-linen bg-paper p-10 transition-shadow duration-300 hover:shadow-card"
          >
            <span className="text-[11px] uppercase tracking-wide text-clay">Talk to us first</span>
            <div>
              <h2 className="font-site-serif text-3xl font-light tracking-tight md:text-4xl">
                Book your first demo
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-clay">
                Thirty minutes with the studio. Bring your products; leave with a shoot
                already underway and a plan for the rest.
              </p>
              <span className="mt-8 inline-block rounded-xl bg-carbon px-5 py-2.5 text-[14px] font-medium text-cream transition-opacity duration-300 group-hover:opacity-85">
                Book a call
              </span>
            </div>
          </Link>
        </motion.div>

        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.08 }}>
          <Link
            href="/asset-studio#pricing"
            className="group flex h-full min-h-[380px] flex-col justify-between rounded-3xl bg-carbon p-10 text-cream transition-opacity duration-300 hover:opacity-95"
          >
            <span className="text-[11px] uppercase tracking-wide text-cream/50">Go straight in</span>
            <div>
              <h2 className="font-site-serif text-3xl font-light tracking-tight md:text-4xl">
                Try our asset studio
              </h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-cream/70">
                Create an account, see pricing in full, and make your first on-brand
                photoshoot today. No call required.
              </p>
              <span className="mt-8 inline-block rounded-xl bg-cream px-5 py-2.5 text-[14px] font-medium text-carbon transition-opacity duration-300 group-hover:opacity-90">
                See pricing
              </span>
            </div>
          </Link>
        </motion.div>
      </section>

      {/* How it works — three quiet steps. */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto grid max-w-5xl gap-12 px-6 py-24 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Paste your website",
              d: "The studio reads your site, pulls your products, palette and voice, and builds your brand kit.",
            },
            {
              n: "02",
              t: "Approve your brand brain",
              d: "Everything it learned, laid out like a brand book. Correct it once; it remembers forever.",
            },
            {
              n: "03",
              t: "Ask for anything",
              d: "Product and model photoshoots, campaigns, Meta ads, stories — finished, on-brand, in minutes.",
            },
          ].map((s, i) => (
            <motion.div key={s.n} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }}>
              <p className="font-site-serif text-[15px] text-terra">{s.n}</p>
              <h3 className="mt-3 font-site-serif text-2xl font-light tracking-tight">{s.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-clay">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
