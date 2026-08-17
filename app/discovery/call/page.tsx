"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/site/theme";

/**
 * BOOK THE CALL (CTA) — one headline, one line of support, one button. The cleanest possible
 * promise screen; forwards into the personalized booking flow. Theme-aware.
 */
export default function BookCallCTA() {
  return (
    <main className="flex min-h-screen flex-col bg-cream text-carbon">
      <header className="flex items-center justify-between px-6 py-6 md:px-8 md:py-8">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-accent transition-opacity duration-300 hover:opacity-60">tastebud</Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/discovery" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">
            <ChevronLeft size={13} /> Back
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-2xl font-edito text-4xl font-light leading-tight tracking-tight text-carbon md:text-5xl"
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

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.35 }}>
          <Link
            href="/discovery/book"
            className="mt-10 inline-block rounded-full bg-carbon px-9 py-3.5 text-sm font-medium text-paper transition-opacity duration-300 ease-brand hover:opacity-90"
          >
            Choose a time
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
