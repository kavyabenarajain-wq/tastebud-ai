"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 2 — Choose your path.
 * One quiet question, two equal panels. The wording self-sorts people by situation.
 */
const PATHS = [
  {
    href: "/discovery",
    title: "Brand Discovery",
    sub: "I don’t have a brand yet. Help me build one.",
  },
  {
    href: "/studio",
    title: "Asset Studio",
    sub: "I have a brand. Study it, then make the visuals.",
  },
];

export default function Choose() {
  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-8 py-8">
        <Wordmark size="sm" href="/" />
        <BackLink href="/" />
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="mb-12 text-center font-serif text-2xl font-light tracking-tight text-ink md:text-3xl"
        >
          Where are you starting from?
        </motion.p>

        <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline md:grid-cols-2">
          {PATHS.map((p, i) => (
            <motion.div
              key={p.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
            >
              <Link
                href={p.href}
                className="group flex h-full min-h-[44vh] flex-col justify-between bg-canvas p-9 transition-colors duration-300 ease-brand hover:bg-surface md:p-12"
              >
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {i === 0 ? "the service" : "the tool"}
                </span>
                <div>
                  <h2 className="font-serif text-3xl font-light tracking-tight text-ink md:text-4xl">
                    {p.title}
                  </h2>
                  <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted">{p.sub}</p>
                  <span className="mt-6 inline-block text-sm text-ink opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    Enter →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
