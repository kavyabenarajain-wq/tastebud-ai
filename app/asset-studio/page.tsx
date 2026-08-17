"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CTA } from "@/components/site/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

const CAPABILITIES = [
  { t: "Product photoshoots", d: "Your exact product — label, shape, colour — in scenes a camera would believe." },
  { t: "Model photoshoots", d: "Build a model or bring a reference; the same face carries your whole set." },
  { t: "Campaigns & Meta ads", d: "Copy, typography and placements art-directed from your positioning, not a template." },
  { t: "Stories & carousels", d: "Instagram-native formats, sized and finished, straight from one brief." },
  { t: "4K finishing", d: "A deterministic grade, grain and sharpen pass on everything — export-ready." },
  { t: "Brand memory", d: "Keep, hero or reject any shot. The studio learns your taste and keeps it." },
];

const HOW_IT_WORKS = [
  { t: "Everything runs on Meals", d: "1 Meal = 1 finished, brand-locked, 4K creative. Chat, brand research, exports and redos are always free." },
  { t: "Start with a free taste", d: "New accounts begin with free images to try the whole studio before choosing a plan." },
  { t: "You only pay for keepers", d: "Every delivered creative comes with free redos, so you never pay per attempt — only per plated dish." },
];

/** ASSET STUDIO — the self-serve tool, not open yet. A polished coming-soon page: what's coming,
 *  a taste of the work, how it'll work, and a way to be first in. Fully theme-aware. */
export default function AssetStudio() {
  return (
    <main className="bg-paper text-carbon">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-36 text-center md:pt-48">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-linen px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-clay">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Coming soon
          </span>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mt-7 font-edito text-5xl font-light leading-[1] tracking-tight md:text-7xl">
            Every asset your brand needs. From a studio that remembers.
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-8 max-w-xl text-[17px] leading-relaxed text-clay">
            The self-serve Asset Studio is almost here. Paste your website once; it builds your
            brand kit, learns your products, then makes whatever you ask — talking to you like a
            creative director, not a form. Be first in.
          </p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10">
          <NotifyForm />
        </Reveal>
        <Reveal delay={0.24}>
          <p className="mt-6 text-[14px] text-clay">
            Can&rsquo;t wait?{" "}
            <a href="/discovery/book" className="text-carbon underline underline-offset-4 hover:opacity-70">
              Book a discovery call
            </a>{" "}
            and we&rsquo;ll build your brand now.
          </p>
        </Reveal>
      </section>

      {/* Capabilities */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.2em] text-clay">One brief in. Finished work out.</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mb-14 mt-4 max-w-2xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
              Everything it will make.
            </h2>
          </Reveal>
          <Stagger className="grid gap-x-10 gap-y-14 md:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <StaggerItem key={c.t}>
                <h3 className="font-edito text-2xl font-light tracking-tight">{c.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-clay">{c.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* How it'll work (calm, non-interactive teaser) */}
      <section className="border-t border-linen">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <Reveal>
            <h2 className="max-w-2xl font-edito text-4xl font-light leading-[1.02] tracking-tight md:text-5xl">
              How it&rsquo;ll work.
            </h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {HOW_IT_WORKS.map((h) => (
              <StaggerItem key={h.t}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-linen text-accent">
                  <Check size={15} />
                </span>
                <h3 className="mt-4 font-edito text-2xl font-light tracking-tight">{h.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-clay">{h.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-linen bg-cream">
        <div className="mx-auto max-w-3xl px-6 py-20 md:py-28 text-center">
          <Reveal>
            <h2 className="font-edito text-4xl font-light tracking-tight md:text-6xl">Be first through the door.</h2>
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-clay">
              We&rsquo;ll email you the moment the studio opens. Or start today — book a discovery call
              and we&rsquo;ll build your brand by hand.
            </p>
            <div className="mt-9">
              <NotifyForm />
            </div>
            <div className="mt-6">
              <CTA href="/discovery/book" variant="outline" size="md" arrow={false}>Book a discovery call</CTA>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

/** NotifyForm — a quiet email capture. Stores locally and confirms; the real conversion today is
 *  the discovery call, so this never blocks and always has a way forward. */
function NotifyForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(email);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      const list = JSON.parse(localStorage.getItem("tb.notifyList") || "[]");
      list.push({ email: email.trim(), at: new Date().toISOString() });
      localStorage.setItem("tb.notifyList", JSON.stringify(list));
    } catch {}
    setDone(true);
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-linen bg-cream px-5 py-3 text-[14px] text-carbon"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-paper">
          <Check size={12} />
        </span>
        You&rsquo;re on the list — we&rsquo;ll be in touch.
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@brand.com"
        aria-label="Email address"
        className="flex-1 rounded-full border border-linen bg-paper px-5 py-3.5 text-[15px] text-carbon placeholder:text-clay/60 outline-none transition-colors focus:border-carbon"
      />
      <button
        type="submit"
        disabled={!valid}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-carbon px-6 py-3.5 text-[12px] font-medium uppercase tracking-[0.14em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-40"
      >
        Notify me <ArrowRight size={14} />
      </button>
    </form>
  );
}
