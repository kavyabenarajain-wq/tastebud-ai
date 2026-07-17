"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const rise = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
} as const;

const DELIVERABLES = [
  {
    t: "World & positioning",
    d: "Who you are, who it's for, and the one idea everything hangs on — written down, argued for, yours.",
  },
  {
    t: "Palette & typography",
    d: "Sampled from your actual product — never an invented moodboard. Colours and type that survive contact with reality.",
  },
  {
    t: "Voice & story",
    d: "How the brand speaks — on a label, in an ad, in a caption. A voice you can hand to anyone.",
  },
  {
    t: "A living brand brain",
    d: "Everything above loaded into the studio, so every future asset starts already on-brand.",
  },
];

/** BRAND BUILD — the service page: we build the brand with you, then it lives in the studio. */
export default function BrandBuild() {
  return (
    <main className="bg-cream text-ink">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-44 text-center">
        <motion.p {...rise} className="text-[12px] uppercase tracking-wide text-clay">
          Brand build
        </motion.p>
        <motion.h1
          {...rise}
          transition={{ ...rise.transition, delay: 0.06 }}
          className="mt-6 font-site-serif text-5xl font-light leading-[1.05] tracking-tight md:text-6xl"
        >
          Don&rsquo;t have a brand yet?
          <br />
          We&rsquo;ll build it with you.
        </motion.h1>
        <motion.p
          {...rise}
          transition={{ ...rise.transition, delay: 0.12 }}
          className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-clay"
        >
          Brand build is a working engagement, not a template. We shape the world,
          the palette, the type and the voice — then load it all into the studio so
          the assets never drift off-brand.
        </motion.p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 pb-24 md:grid-cols-2">
        {DELIVERABLES.map((c, i) => (
          <motion.div
            key={c.t}
            {...rise}
            transition={{ ...rise.transition, delay: i * 0.06 }}
            className="rounded-3xl border border-linen bg-paper p-9"
          >
            <h2 className="font-site-serif text-2xl font-light tracking-tight">{c.t}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-clay">{c.d}</p>
          </motion.div>
        ))}
      </section>

      <section className="border-t border-linen">
        <div className="mx-auto grid max-w-5xl gap-12 px-6 py-24 md:grid-cols-3">
          {[
            { n: "01", t: "A conversation", d: "One call. Where you are, what you make, where it should go." },
            { n: "02", t: "A direction", d: "We come back with the world — references, palette, type, voice — and refine it with you." },
            { n: "03", t: "A brand, live", d: "The finished kit lands in your studio, ready to make its first campaign that day." },
          ].map((s, i) => (
            <motion.div key={s.n} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }}>
              <p className="font-site-serif text-[15px] text-terra">{s.n}</p>
              <h3 className="mt-3 font-site-serif text-2xl font-light tracking-tight">{s.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-clay">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-28">
        <motion.div
          {...rise}
          className="mx-auto flex max-w-5xl flex-col items-center rounded-3xl bg-carbon px-8 py-20 text-center text-cream"
        >
          <h2 className="font-site-serif text-4xl font-light tracking-tight md:text-5xl">
            Start with a conversation.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-cream/70">
            Tell us what you&rsquo;re making. We&rsquo;ll tell you what the brand could be.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/discovery/book"
              className="rounded-xl bg-cream px-6 py-3 text-[15px] font-medium text-carbon transition-opacity duration-300 hover:opacity-90"
            >
              Book a demo
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-cream/25 px-6 py-3 text-[15px] text-cream transition-colors duration-300 hover:bg-cream/10"
            >
              Already have a brand? Try the studio
            </Link>
          </div>
        </motion.div>
      </section>

      <SiteFooter />
    </main>
  );
}
