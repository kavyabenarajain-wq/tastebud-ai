"use client";

import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * The quiet header for the Asset Studio onboarding flow: back + wordmark on the left,
 * a slim 5-segment progress rail on the right. Recedes so the work is the only focus.
 */

const STEPS = ["Source", "About", "Focus", "Brand Kit", "Products"] as const;

export function OnboardHeader({ step, back }: { step: number; back?: string }) {
  return (
    <header className="flex items-center justify-between px-8 py-6">
      <div className="flex items-center gap-5">
        {back && <BackLink href={back} />}
        <Wordmark size="sm" href="/" />
      </div>
      <div className="hidden items-center gap-4 sm:flex">
        <span className="text-[11px] uppercase tracking-wide text-muted">
          {step >= 1 && step <= STEPS.length ? `${STEPS[step - 1]} · ${step} of ${STEPS.length}` : "Asset Studio"}
        </span>
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => {
            const done = i + 1 <= step;
            return (
              <motion.span
                key={s}
                initial={false}
                animate={{ backgroundColor: done ? "#1D1D1F" : "#D2D2D7", width: i + 1 === step ? 22 : 12 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="h-[3px] rounded-full"
              />
            );
          })}
        </div>
      </div>
    </header>
  );
}
