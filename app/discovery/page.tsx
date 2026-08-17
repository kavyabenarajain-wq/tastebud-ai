"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/site/theme";

/**
 * WHAT YOU GET — the education-by-demonstration page for Brand Discovery.
 * A calm vertical scroll: every element of the brand guidelines as one section — name, why it
 * matters, and a sanitised fragment so you FEEL the quality. It earns the call. Fully theme-aware;
 * a persistent CTA waits at the foot.
 */

type Section = {
  kicker: string;
  title: string;
  blurb: string;
  fragment: React.ReactNode;
};

const Slide = ({ children }: { children: React.ReactNode }) => (
  <div className="aspect-[4/3] w-full overflow-hidden rounded-[14px] border border-linen bg-paper p-7">
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
        <div className="text-[10px] uppercase tracking-wide text-clay">Our purpose</div>
        <p className="mt-4 font-edito text-xl font-light leading-snug text-carbon">
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
            <div className="text-[10px] uppercase tracking-wide text-clay">Mission</div>
            <p className="mt-2 text-sm leading-relaxed text-carbon">Put a considered object in every hand, at a fair price.</p>
          </div>
          <div className="border-l border-linen pl-5">
            <div className="text-[10px] uppercase tracking-wide text-clay">Vision</div>
            <p className="mt-2 text-sm leading-relaxed text-carbon">A category that values restraint over noise.</p>
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
        <div className="text-[10px] uppercase tracking-wide text-clay">Positioning</div>
        <div className="mt-4 space-y-2 text-sm text-carbon">
          <div className="flex justify-between border-b border-linen pb-2"><span className="text-clay">For</span><span>discerning first-time buyers</span></div>
          <div className="flex justify-between border-b border-linen pb-2"><span className="text-clay">Unlike</span><span>loud, discount-led peers</span></div>
          <div className="flex justify-between"><span className="text-clay">We are</span><span>the quiet, exacting one</span></div>
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
        <div className="text-[10px] uppercase tracking-wide text-clay">Voice — we are</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Plain", "Warm", "Exact", "Unhurried", "Never salesy"].map((w) => (
            <span key={w} className="rounded-full border border-linen px-3 py-1 text-sm text-carbon">{w}</span>
          ))}
        </div>
        <p className="mt-5 font-edito text-base font-light italic text-clay">“We say what it does. Then we stop.”</p>
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
          <span className="font-edito text-4xl font-light tracking-tight text-carbon">marque</span>
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
        <div className="text-[10px] uppercase tracking-wide text-clay">Palette</div>
        <div className="mt-4 flex h-2/3 gap-3">
          {["#1D1D1F", "#6E6E73", "#D2D2D7", "#185D97", "#F5F2EA"].map((c) => (
            <div key={c} className="flex-1 rounded-md border border-linen" style={{ background: c }} />
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
          <div className="font-edito text-3xl font-light tracking-tight text-carbon">Aa</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-clay">Display — Bricolage</div>
          <div className="mt-4 text-lg text-carbon">Aa</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-clay">Text — Inter</div>
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
        <div className="text-[10px] uppercase tracking-wide text-clay">Art direction</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Warm, motivated light", "Real contact shadow", "Considered styling", "Camera, never CGI"].map((w) => (
            <span key={w} className="rounded-full border border-linen px-3 py-1 text-sm text-carbon">{w}</span>
          ))}
        </div>
        <p className="mt-5 font-edito text-base font-light italic text-clay">“Every image looks like a camera made it.”</p>
      </Slide>
    ),
  },
];

export default function WhatYouGet() {
  return (
    <main className="min-h-screen bg-cream text-carbon">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-linen bg-cream/80 px-6 py-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-5">
          <Link href="/brand-discovery" className="inline-flex items-center gap-1 text-[13px] text-clay transition-opacity hover:opacity-60">
            <ChevronLeft size={15} /> Back
          </Link>
          <Link href="/" className="font-edito text-lg tracking-tight text-accent transition-opacity hover:opacity-60">tastebud</Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-[11px] uppercase tracking-wide text-clay sm:inline">What a real brand contains</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6">
        <section className="flex min-h-[70vh] flex-col justify-center py-20">
          <h1 className="font-edito text-5xl font-light leading-[1.05] tracking-tight text-carbon md:text-6xl">
            This is everything you walk away with.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-clay">
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
            className="grid items-center gap-10 border-t border-linen py-16 md:py-24 md:grid-cols-2"
          >
            <div>
              <div className="text-[11px] uppercase tracking-wide text-clay">{s.kicker}</div>
              <h2 className="mt-3 font-edito text-4xl font-light tracking-tight text-carbon">{s.title}</h2>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-clay">{s.blurb}</p>
            </div>
            {s.fragment}
          </motion.section>
        ))}

        <section className="flex min-h-[60vh] flex-col items-center justify-center border-t border-linen py-16 md:py-24 text-center">
          <p className="font-edito text-3xl font-light tracking-tight text-carbon md:text-4xl">
            …and everything in between.
          </p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-clay">
            Built together over one focused call, delivered in a day.
          </p>
        </section>
      </div>

      {/* Persistent, quiet way forward. */}
      <div className="pointer-events-none sticky bottom-0 z-10 flex justify-center pb-8">
        <Link
          href="/discovery/book"
          className="pointer-events-auto rounded-full bg-carbon px-7 py-3 text-sm font-medium text-paper shadow-[0_10px_40px_-12px_rgba(0,0,0,0.5)] transition-opacity duration-300 ease-brand hover:opacity-90"
        >
          Book your call →
        </Link>
      </div>
    </main>
  );
}
