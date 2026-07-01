"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Camera, UserRound, GalleryHorizontalEnd, Megaphone, Smartphone, MoreHorizontal, Check } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { BrandKitBuildPanel } from "@/components/tastebud/BrandKitBuildPanel";
import { useStudio } from "@/components/tastebud/StudioSession";

/**
 * STEP 3 — What do you make?
 * Why they're here — pick everything they want to create. Multi-select; carried into
 * the workspace as the creative-type filters. The live panel keeps assembling alongside.
 */
const USES = [
  { label: "Product photoshoots", Icon: Camera },
  { label: "Model photoshoots", Icon: UserRound },
  { label: "Instagram carousels", Icon: GalleryHorizontalEnd },
  { label: "Meta ads", Icon: Megaphone },
  { label: "Instagram story", Icon: Smartphone },
  { label: "Something else", Icon: MoreHorizontal },
];

export default function StudioMake() {
  const router = useRouter();
  const { brain, hydrated, research, patch } = useStudio();
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (hydrated && !brain.name && !research.started) router.replace("/studio");
  }, [hydrated, brain.name, research.started, router]);

  useEffect(() => {
    if (hydrated && brain.uses?.length) setPicked(brain.uses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const toggle = (label: string) => setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));

  function next() {
    patch({ uses: picked });
    router.push("/studio/building");
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={3} back="/studio/about" />

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-12 px-6 pb-24 md:grid-cols-[1fr_340px]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="self-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">Why Tastebud</span>
          <h1 className="mt-3 font-serif text-4xl font-light leading-[1.05] tracking-tight text-ink md:text-5xl">What do you make?</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">Pick everything you want to create. You can change this anytime.</p>

          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {USES.map(({ label, Icon }) => {
              const on = picked.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => toggle(label)}
                  className={`group flex items-center gap-3 rounded-card border px-5 py-4 text-left transition-colors duration-200 ${on ? "border-ink bg-surface" : "border-hairline hover:border-ink hover:bg-surface"}`}
                >
                  <Icon size={18} strokeWidth={1.5} className={on ? "text-ink" : "text-muted"} />
                  <span className="flex-1 text-[15px] text-ink">{label}</span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-transparent"}`}>
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={next}
            disabled={picked.length === 0}
            className="mt-9 inline-flex items-center gap-2 rounded-control bg-ink px-7 py-3 text-[15px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Continue <ArrowRight size={16} />
          </button>
        </motion.div>

        <div className="md:pt-4"><div className="md:sticky md:top-6"><BrandKitBuildPanel /></div></div>
      </div>
    </main>
  );
}
