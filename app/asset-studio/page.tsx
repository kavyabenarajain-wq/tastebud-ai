"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PricingSection } from "@/components/site/PricingSection";

const rise = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
} as const;

const CAPABILITIES = [
  { t: "Product photoshoots", d: "Your exact product — label, shape, colour — in scenes a camera would believe." },
  { t: "Model photoshoots", d: "Build a model or bring a reference; the same face carries your whole set." },
  { t: "Campaigns & Meta ads", d: "Copy, typography and placements art-directed from your positioning, not a template." },
  { t: "Stories & carousels", d: "Instagram-native formats, sized and finished, straight from one brief." },
  { t: "4K finishing", d: "A deterministic grade, grain and sharpen pass on everything — export-ready." },
  { t: "Brand memory", d: "Keep, hero or reject any shot. The studio learns your taste and keeps it." },
];

/** ASSET BUILDING — the tool page: what the studio makes; door to pricing (account first). */
export default function AssetStudio() {
  return (
    <main className="bg-cream text-ink">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-44 text-center">
        <motion.p {...rise} className="text-[12px] uppercase tracking-wide text-clay">
          Asset building
        </motion.p>
        <motion.h1
          {...rise}
          transition={{ ...rise.transition, delay: 0.06 }}
          className="mt-6 font-site-serif text-5xl font-light leading-[1.05] tracking-tight md:text-6xl"
        >
          Every asset your brand needs.
          <br />
          From a studio that remembers.
        </motion.h1>
        <motion.p
          {...rise}
          transition={{ ...rise.transition, delay: 0.12 }}
          className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-clay"
        >
          Paste your website once. The studio builds your brand kit, learns your
          products, and then makes whatever you ask — talking to you like a creative
          director, not a form.
        </motion.p>
        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.18 }} className="mt-10">
          <Link
            href="#pricing"
            className="rounded-xl bg-carbon px-6 py-3 text-[15px] font-medium text-cream transition-opacity duration-300 hover:opacity-85"
          >
            See plans &amp; start
          </Link>
        </motion.div>
      </section>

      <section className="border-t border-linen">
        <div className="mx-auto grid max-w-5xl gap-5 px-6 py-24 md:grid-cols-3">
          {CAPABILITIES.map((c, i) => (
            <motion.div
              key={c.t}
              {...rise}
              transition={{ ...rise.transition, delay: (i % 3) * 0.06 }}
              className="rounded-3xl border border-linen bg-paper p-8"
            >
              <h2 className="font-site-serif text-xl font-light tracking-tight">{c.t}</h2>
              <p className="mt-2.5 text-[14px] leading-relaxed text-clay">{c.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing lives here now — there is no separate /pricing page. */}
      <div className="border-t border-linen pt-16">
        <PricingSection />
      </div>

      <SiteFooter />
    </main>
  );
}
