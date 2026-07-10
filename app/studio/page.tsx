"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Globe } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { useStudio } from "@/components/tastebud/StudioSession";

/**
 * STEP 1 — Where should we pull from?
 * The studio starts from the brand's own site. Research kicks off the MOMENT a real URL
 * lands in the box — on paste, or as soon as typing settles — so the brand kit is already
 * assembling before the user hits "Build". `speculateResearch` is idempotent per host, so
 * the button click just carries them forward without restarting anything. "Skip for now"
 * starts from brand defaults instead.
 */
export default function StudioSource() {
  const router = useRouter();
  const { brain, hydrated, research, resetForNewBrand, patch, speculateResearch } = useStudio();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (hydrated && brain.website && !value) setValue(brain.website);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Type → wait for the domain to settle, then start. speculateResearch no-ops on half-typed
  // text and on a site we're already researching, so this is safe to call freely.
  function onChange(next: string) {
    setValue(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => speculateResearch(next), 500);
  }

  // Paste → start immediately, no debounce; this is the "the moment they paste" path.
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    if (pasted) speculateResearch(pasted);
  }

  function build() {
    const website = value.trim();
    if (!website) { inputRef.current?.focus(); return; }
    clearTimeout(debounceRef.current);
    speculateResearch(website);   // arms + starts research for this exact site (no-op if already running)
    router.push("/studio/about");
  }

  function skip() {
    clearTimeout(debounceRef.current);
    resetForNewBrand();                               // a fresh, blank brand — cancels any speculative run
    patch({ skippedResearch: true, name: "New Brand" });
    router.push("/studio/about");
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={1} back="/choose" />

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="text-center"
        >
          <span className="inline-block rounded-full border border-hairline px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
            Set up your studio
          </span>
          <h1 className="mt-6 font-serif text-4xl font-light leading-[1.05] tracking-tight text-ink md:text-5xl">
            Where should we pull from?
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            Drop your website and I&rsquo;ll start building your brand kit right away, while you answer a couple of quick questions.
          </p>

          <div className="mt-9 flex items-center gap-3 rounded-control border border-hairline bg-surface px-4 py-1 transition-colors focus-within:border-ink">
            <Globe size={16} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); build(); } }}
              placeholder="yourbrand.com"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent py-3 text-[16px] text-ink placeholder:text-muted/70 focus:outline-none"
            />
          </div>

          <button
            onClick={build}
            disabled={!value.trim()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-control bg-ink px-4 py-3 text-[15px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Build my brand kit <ArrowRight size={16} />
          </button>

          {/* Quiet proof the head start is real — a pulse while it researches, a tick when it lands. */}
          <div className="mt-3 h-4">
            {research.started && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 text-[13px] text-muted"
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${research.done ? "bg-ink" : "animate-pulse bg-muted"}`} />
                {research.error
                  ? "Couldn’t reach that site — you can still continue"
                  : research.done
                  ? `${brain.name || "Your brand"} — brand kit ready`
                  : `Already researching ${brain.name || "your brand"}…`}
              </motion.p>
            )}
          </div>

          <button
            onClick={skip}
            className="mt-2 text-[14px] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Skip for now
          </button>
        </motion.div>
      </div>
    </main>
  );
}
