"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 3 — What You Get.
 * A calm vertical scroll: every element of the brand guidelines as one section —
 * name, why it matters, and a sanitised fragment so they FEEL the quality.
 * Education by demonstration; it earns the call. A persistent CTA waits at the foot.
 */

type Section = {
  kicker: string;
  title: string;
  blurb: string;
  fragment: React.ReactNode;
};

const Slide = ({ children }: { children: React.ReactNode }) => (
  <div className="aspect-[4/3] w-full overflow-hidden rounded-card border border-hairline bg-surface p-7">
    {children}
  </div>
);

const SECTIONS: Section[] = [
  {
    kicker: "01 · Foundation",
    title: "Purpose",
    blurb: "The reason the brand exists beyond profit — the one sentence everything else has to serve.",
    fragment: (
      <Slide>
        <div className="text-[10px] uppercase tracking-wide text-muted">Our purpose</div>
        <p className="mt-4 font-serif text-xl font-light leading-snug text-ink">
          To make the everyday ritual feel considered — for people who notice the details.
        </p>
      </Slide>
    ),
  },
  {
    kicker: "02 · Foundation",
    title: "Mission & Vision",
    blurb: "What we’re doing now, and the world we’re building toward. Direction, made explicit.",
    fragment: (
      <Slide>
        <div className="grid h-full grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">Mission</div>
            <p className="mt-2 text-sm leading-relaxed text-ink">Put a considered object in every hand, at a fair price.</p>
          </div>
          <div className="border-l border-hairline pl-5">
            <div className="text-[10px] uppercase tracking-wide text-muted">Vision</div>
            <p className="mt-2 text-sm leading-relaxed text-ink">A category that values restraint over noise.</p>
          </div>
        </div>
      </Slide>
    ),
  },
  {
    kicker: "03 · Strategy",
    title: "Positioning & Strategy",
    blurb: "Where you sit in the market, who you’re for, and the wedge that makes you the obvious choice.",
    fragment: (
      <Slide>
        <div className="text-[10px] uppercase tracking-wide text-muted">Positioning</div>
        <div className="mt-4 space-y-2 text-sm text-ink">
          <div className="flex justify-between border-b border-hairline pb-2"><span className="text-muted">For</span><span>discerning first-time buyers</span></div>
          <div className="flex justify-between border-b border-hairline pb-2"><span className="text-muted">Unlike</span><span>loud, discount-led peers</span></div>
          <div className="flex justify-between"><span className="text-muted">We are</span><span>the quiet, exacting one</span></div>
        </div>
      </Slide>
    ),
  },
  {
    kicker: "04 · Voice",
    title: "Verbal Identity",
    blurb: "How the brand sounds — voice, tone, the words it uses and the ones it never would.",
    fragment: (
      <Slide>
        <div className="text-[10px] uppercase tracking-wide text-muted">Voice — we are</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Plain", "Warm", "Exact", "Unhurried", "Never salesy"].map((w) => (
            <span key={w} className="rounded-full border border-hairline px-3 py-1 text-sm text-ink">{w}</span>
          ))}
        </div>
        <p className="mt-5 font-serif text-base font-light italic text-muted">“We say what it does. Then we stop.”</p>
      </Slide>
    ),
  },
  {
    kicker: "05 · Identity",
    title: "Logo",
    blurb: "The mark, its construction, clear space, and the ways it may — and may never — be used.",
    fragment: (
      <Slide>
        <div className="flex h-full items-center justify-center">
          <span className="font-serif text-4xl font-light tracking-tight text-ink">marque</span>
        </div>
      </Slide>
    ),
  },
  {
    kicker: "06 · Identity",
    title: "Colour Palette",
    blurb: "A disciplined system — primaries, accents, and exactly where each one is allowed to appear.",
    fragment: (
      <Slide>
        <div className="text-[10px] uppercase tracking-wide text-muted">Palette</div>
        <div className="mt-4 flex h-2/3 gap-3">
          {["#1D1D1F", "#6E6E73", "#D2D2D7", "#F5F5F7", "#FFFFFF"].map((c) => (
            <div key={c} className="flex-1 rounded-md border border-hairline" style={{ background: c }} />
          ))}
        </div>
      </Slide>
    ),
  },
  {
    kicker: "07 · Identity",
    title: "Typography",
    blurb: "The type system — display and text faces, the scale, and how hierarchy is built.",
    fragment: (
      <Slide>
        <div className="flex h-full flex-col justify-center">
          <div className="font-serif text-3xl font-light tracking-tight text-ink">Aa</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">Display — Fraunces</div>
          <div className="mt-4 text-lg text-ink">Aa</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">Text — Inter</div>
        </div>
      </Slide>
    ),
  },
  {
    kicker: "08 · Expression",
    title: "Photography & Art Direction",
    blurb: "The visual world — light, composition, styling, and the feeling every image must carry.",
    fragment: (
      <Slide>
        <div className="grid h-full grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-md bg-gradient-to-b from-hairline to-surface" />
          ))}
        </div>
      </Slide>
    ),
  },
];

export default function WhatYouGet() {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-canvas/80 px-8 py-5 backdrop-blur">
        <div className="flex items-center gap-5">
          <BackLink href="/choose" />
          <Wordmark size="sm" href="/" />
        </div>
        <span className="text-[11px] uppercase tracking-wide text-muted">What a real brand contains</span>
      </header>

      <div className="mx-auto max-w-3xl px-6">
        <section className="flex min-h-[70vh] flex-col justify-center py-20">
          <h1 className="font-serif text-5xl font-light leading-[1.05] tracking-tight text-ink md:text-6xl">
            This is everything you walk away with.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-muted">
            Not a logo and a colour. A complete brand — its thinking, its voice, its look — built with you and
            handed over as a guidelines deck you can actually run a company on.
          </p>
        </section>

        {SECTIONS.map((s) => (
          <motion.section
            key={s.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
            className="grid items-center gap-10 border-t border-hairline py-24 md:grid-cols-2"
          >
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">{s.kicker}</div>
              <h2 className="mt-3 font-serif text-4xl font-light tracking-tight text-ink">{s.title}</h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">{s.blurb}</p>
            </div>
            {s.fragment}
          </motion.section>
        ))}

        <section className="flex min-h-[60vh] flex-col items-center justify-center border-t border-hairline py-24 text-center">
          <p className="font-serif text-3xl font-light tracking-tight text-ink md:text-4xl">
            …and everything in between.
          </p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            Built together over one focused call, delivered in a day.
          </p>
        </section>
      </div>

      {/* Persistent, quiet way forward (spec: reappears as they scroll). */}
      <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center pb-8">
        <Link
          href="/discovery/call"
          className="pointer-events-auto rounded-full bg-ink px-7 py-3 text-sm font-medium text-canvas shadow-card transition-opacity duration-300 ease-brand hover:opacity-90"
        >
          Book your call →
        </Link>
      </div>
    </main>
  );
}
