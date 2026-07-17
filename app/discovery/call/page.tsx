"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 4 — Book the call (CTA).
 * One headline, one line of support, one button. The cleanest possible promise screen.
 */
export default function BookCallCTA() {
  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between px-8 py-8">
        <Wordmark size="sm" href="/" />
        <BackLink href="/discovery" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-2xl font-serif text-4xl font-light leading-tight tracking-tight text-ink md:text-5xl"
        >
          Book a 30-minute call and get your brand sorted in a day.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-5 text-[15px] text-clay"
        >
          One conversation. A complete brand, delivered.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
        >
          <Link
            href="/discovery/book"
            className="mt-10 inline-block rounded-full bg-carbon px-9 py-3.5 text-sm font-medium text-cream transition-opacity duration-300 ease-brand hover:opacity-90"
          >
            Choose a time
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
