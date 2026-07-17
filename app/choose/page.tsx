"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 2 — Enter the studio.
 * Brand Discovery was removed here: anyone arriving from a plan already has a brand, so the
 * single, clear way forward is the Asset Studio. Beige, matching the marketing + pricing world.
 */
export default function Choose() {
  return (
    <main className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="flex items-center justify-between px-8 py-8">
        <Wordmark size="sm" href="/" />
        <BackLink href="/" />
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="mb-3 text-center text-[12px] uppercase tracking-wide text-clay"
        >
          Welcome in
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.4, 0, 0.2, 1] }}
          className="mb-10 text-center font-serif text-3xl font-light tracking-tight md:text-4xl"
        >
          Let&rsquo;s make something on-brand.
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.14, ease: [0.4, 0, 0.2, 1] }}
        >
          <Link
            href="/studio"
            className="group flex min-h-[40vh] flex-col justify-between rounded-3xl border border-linen bg-paper p-10 transition-shadow duration-300 ease-brand hover:shadow-card md:p-14"
          >
            <span className="text-[11px] uppercase tracking-wide text-clay">the studio</span>
            <div>
              <h2 className="font-serif text-3xl font-light tracking-tight md:text-4xl">Asset Studio</h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-clay">
                Study your brand, then make the visuals — product shoots, model shoots and campaigns — all in one place.
              </p>
              <span className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-transform duration-300 ease-brand group-hover:translate-x-1">
                Enter the studio &rarr;
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
