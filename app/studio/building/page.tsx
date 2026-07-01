"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BrandKitBuildPanel } from "@/components/tastebud/BrandKitBuildPanel";
import { useStudio } from "@/components/tastebud/StudioSession";

/**
 * STEP 4 — Putting your studio together.
 * The quiet finish: answers are saved, the checklist walks through the build while the
 * live panel shows the real brand kit assembling. Paces to the last step, then holds
 * until background research actually lands — then carries into the Brand Brain reveal.
 */
const STAGES = [
  "Reading your site",
  "Pulling your palette",
  "Learning your type",
  "Capturing your voice",
  "Curating your imagery",
  "Matching your style",
  "Setting up your workspace",
  "Tuning the details",
  "Assembling your studio",
];

const STEP_MS = 720;

export default function StudioBuilding() {
  const router = useRouter();
  const { brain, hydrated, research } = useStudio();
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const navigated = useRef(false);

  const done = research.done || !!brain.skippedResearch;

  // Guard.
  useEffect(() => {
    if (hydrated && !brain.name && !research.started) router.replace("/studio");
  }, [hydrated, brain.name, research.started, router]);

  // Pace the checklist up to the last step, then hold.
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setProgress((p) => (p < STAGES.length - 1 ? p + 1 : p)), STEP_MS);
    return () => clearInterval(id);
  }, [finished]);

  // Complete once research is done AND we've reached the last step — then reveal.
  useEffect(() => {
    if (done && progress >= STAGES.length - 1 && !finished) {
      setProgress(STAGES.length);
      setFinished(true);
      if (navigated.current) return;
      navigated.current = true;
      const next = brain.skippedResearch || !brain.website ? "/studio/create" : "/studio/intelligence";
      setTimeout(() => router.push(next), 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, progress, finished]);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-center px-8 py-6">
        <Wordmark size="sm" href="/" />
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-14 px-8 pb-24 md:grid-cols-[1fr_340px]">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted">Almost there</span>
          <h1 className="mt-3 font-serif text-4xl font-light leading-[1.05] tracking-tight text-ink md:text-5xl">
            Putting your studio together&hellip;
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">Your answers are saved — we&rsquo;re finishing your brand kit.</p>

          <ol className="mt-10 space-y-3.5">
            {STAGES.map((s, i) => {
              const status = i < progress ? "done" : i === progress ? "active" : "pending";
              return (
                <li key={s} className="flex items-center gap-3.5">
                  <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                    {status === "done" ? (
                      <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }} className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-canvas">
                        <Check size={12} strokeWidth={2.5} />
                      </motion.span>
                    ) : status === "active" ? (
                      <>
                        <motion.span className="absolute h-5 w-5 rounded-full border border-ink" animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
                        <span className="h-2 w-2 rounded-full bg-ink" />
                      </>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-hairline" />
                    )}
                  </span>
                  <span className={`text-[16px] transition-colors duration-300 ${status === "pending" ? "text-hairline" : "text-ink"}`}>{s}</span>
                </li>
              );
            })}
          </ol>

          <AnimatePresence>
            {research.error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-[13px] text-muted">
                I couldn&rsquo;t fully read the site — I&rsquo;ll start from your answers and brand defaults.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div><div className="md:sticky md:top-6"><BrandKitBuildPanel /></div></div>
      </div>
    </main>
  );
}
