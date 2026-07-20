"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

/** PAGE 2 — Enter the studio. Single clear door → the Asset Studio. Light monochrome. */
export default function Choose() {
  return (
    <main className="flex min-h-screen flex-col bg-paper text-carbon">
      <header className="flex items-center justify-between px-8 py-8">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-carbon transition-opacity duration-300 hover:opacity-60">tastebud</Link>
        <Link href="/" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">
          <ChevronLeft size={13} /> Back
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-4 text-center text-[11px] uppercase tracking-[0.2em] text-clay"
        >
          Welcome in
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 text-center font-edito text-4xl font-light tracking-tight md:text-5xl"
        >
          Let&rsquo;s make something on-brand.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            href="/studio"
            className="group flex min-h-[38vh] flex-col justify-between rounded-sm border border-linen bg-cream p-10 transition-colors duration-500 hover:border-carbon/25 md:p-14"
          >
            <span className="text-[11px] uppercase tracking-[0.2em] text-clay">The studio</span>
            <div>
              <h2 className="font-edito text-3xl font-light tracking-tight md:text-5xl">Asset Studio</h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-clay">
                Study your brand, then make the visuals — product shoots, model shoots and campaigns — all in one place.
              </p>
              <span className="mt-8 inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-carbon transition-transform duration-300 group-hover:translate-x-1.5">
                Enter the studio <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
