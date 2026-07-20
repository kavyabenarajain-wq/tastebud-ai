"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Calendar booking — the single demo endpoint. Light monochrome.
 * A real Cal.com/Calendly embed renders when NEXT_PUBLIC_SCHEDULER_URL is set; otherwise a
 * styled placeholder + fallback form. On confirm we pre-create the brand's folder.
 */
const SCHEDULER_URL = process.env.NEXT_PUBLIC_SCHEDULER_URL || "";

function SchedulerSlot() {
  if (SCHEDULER_URL) {
    return <iframe src={SCHEDULER_URL} title="Book a call" className="h-[60vh] w-full rounded-sm border border-linen" />;
  }
  return (
    <div className="flex h-[44vh] flex-col items-center justify-center rounded-sm border border-dashed border-linen bg-cream text-center">
      <div className="text-[11px] uppercase tracking-[0.2em] text-clay">Scheduler</div>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-clay">
        Your Cal.com / Calendly embed lives here. Until it&rsquo;s connected, confirm below and we&rsquo;ll hold your slot and reach out.
      </p>
    </div>
  );
}

export default function BookCalendar() {
  const [form, setForm] = useState({ name: "", brand: "", email: "" });
  const [booked, setBooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = form.name.trim() && form.brand.trim() && /\S+@\S+\.\S+/.test(form.email);

  async function confirm() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await fetch("/api/brains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discovery: { name: form.brand.trim(), email: form.email.trim() } }),
      });
    } catch {
      /* booking still succeeds even if pre-create hiccups */
    }
    setBooked(true);
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper text-carbon">
      <header className="flex items-center justify-between px-8 py-8">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-carbon transition-opacity duration-300 hover:opacity-60">tastebud</Link>
        <Link href="/" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">
          <ChevronLeft size={13} /> Back
        </Link>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
        {booked ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-[60vh] flex-col items-center justify-center text-center"
          >
            <span className="mb-8 flex h-14 w-14 items-center justify-center rounded-full bg-carbon text-2xl text-paper">✓</span>
            <h1 className="font-edito text-4xl font-light tracking-tight md:text-5xl">You&rsquo;re booked.</h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-clay">
              Check your email for the confirmation. We&rsquo;ve started a folder for{" "}
              <span className="text-carbon">{form.brand}</span> — we&rsquo;ll have your brand world ready to build the moment we talk.
            </p>
            <Link
              href="/asset-studio#pricing"
              className="mt-9 rounded-full bg-carbon px-6 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-paper transition-colors duration-300 hover:bg-carbon/85"
            >
              Explore the studio while you wait
            </Link>
          </motion.div>
        ) : (
          <>
            <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-clay">Book a demo</p>
            <h1 className="mt-4 font-edito text-4xl font-light tracking-tight md:text-5xl">Pick a time.</h1>
            <p className="mt-3 text-[15px] text-clay">Thirty minutes. Bring everything you have — or nothing.</p>

            <div className="mt-8">
              <SchedulerSlot />
            </div>

            {!SCHEDULER_URL && (
              <div className="mt-8 grid gap-4">
                <Input label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <Input label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
                <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <button
                  onClick={confirm}
                  disabled={!valid || busy}
                  className="mt-2 rounded-full bg-carbon px-7 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-30"
                >
                  {busy ? "Confirming…" : "Confirm booking"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-clay">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-linen bg-paper px-3.5 py-2.5 text-[15px] text-carbon placeholder:text-clay/60 outline-none transition-colors focus:border-carbon"
      />
    </label>
  );
}
