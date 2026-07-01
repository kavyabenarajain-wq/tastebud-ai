"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { BrandKitBuildPanel } from "@/components/tastebud/BrandKitBuildPanel";
import { useStudio } from "@/components/tastebud/StudioSession";

/**
 * STEP 2 — A bit about you.
 * Three quick taps (role, brand, team size) that tune how the studio behaves — while
 * the brand kit keeps assembling in the live panel on the right.
 */
const ROLES = ["Founder", "Brand owner", "Creator", "Designer", "Agency", "Marketer", "Other"];
const BRANDS = ["DTC / ecommerce", "SaaS", "Creator / personal", "Local / services", "Agency", "Other"];
const TEAMS = ["Just me", "2-5", "6-10", "11-50", "50+"];

export default function StudioAbout() {
  const router = useRouter();
  const { brain, hydrated, research, patch } = useStudio();
  const [role, setRole] = useState<string>();
  const [brandType, setBrandType] = useState<string>();
  const [teamSize, setTeamSize] = useState<string>();

  // Guard: land here only mid-flow.
  useEffect(() => {
    if (hydrated && !brain.name && !research.started) router.replace("/studio");
  }, [hydrated, brain.name, research.started, router]);

  // Prefill on return.
  useEffect(() => {
    if (!hydrated) return;
    setRole(brain.role); setBrandType(brain.brandType); setTeamSize(brain.teamSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function next() {
    patch({ role, brandType, teamSize });
    router.push("/studio/make");
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={2} back="/studio" />

      <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-12 px-6 pb-24 md:grid-cols-[1fr_340px]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="self-center">
          <span className="text-[11px] uppercase tracking-wide text-muted">A bit about you</span>
          <h1 className="mt-3 font-serif text-4xl font-light leading-[1.05] tracking-tight text-ink md:text-5xl">A bit about you.</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">So your studio fits how you work.</p>

          <Group label="Your role" options={ROLES} value={role} onChange={setRole} />
          <Group label="Your brand" options={BRANDS} value={brandType} onChange={setBrandType} />
          <Group label="Team size" options={TEAMS} value={teamSize} onChange={setTeamSize} />

          <button
            onClick={next}
            className="mt-10 inline-flex items-center gap-2 rounded-control bg-ink px-7 py-3 text-[15px] font-medium text-canvas transition-opacity hover:opacity-90"
          >
            Continue <ArrowRight size={16} />
          </button>
        </motion.div>

        <div className="md:pt-4"><div className="md:sticky md:top-6"><BrandKitBuildPanel /></div></div>
      </div>
    </main>
  );
}

function Group({ label, options, value, onChange }: { label: string; options: string[]; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-8">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`rounded-full border px-4 py-2 text-[14px] transition-colors duration-200 ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-ink hover:border-ink hover:bg-surface"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
