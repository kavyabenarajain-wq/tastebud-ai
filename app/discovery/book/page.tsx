"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 5 — Calendar booking.
 * A scheduler framed in the same minimal styling so it never feels bolted-on.
 *
 * SCHEDULER: a styled placeholder for now. Drop a real embed in <SchedulerSlot/> —
 * paste a Cal.com or Calendly link into NEXT_PUBLIC_SCHEDULER_URL and the iframe
 * renders; both the client and the host get the native confirmation emails.
 *
 * On confirm we quietly pre-create the brand's folder in the brain store so the
 * work is ready when the call happens (spec recommendation).
 */
const SCHEDULER_URL = process.env.NEXT_PUBLIC_SCHEDULER_URL || "";

function SchedulerSlot() {
  if (SCHEDULER_URL) {
    return (
      <iframe
        src={SCHEDULER_URL}
        title="Book a call"
        className="h-[60vh] w-full rounded-card border border-linen"
      />
    );
  }
  return (
    <div className="flex h-[46vh] flex-col items-center justify-center rounded-card border border-dashed border-linen bg-paper text-center">
      <div className="text-[11px] uppercase tracking-wide text-clay">Scheduler</div>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-clay">
        Your Cal.com / Calendly embed lives here. Until it’s connected, confirm below and we’ll hold your slot
        and reach out.
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
      // Pre-create the brand folder so Discovery work is ready at call time.
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
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between px-8 py-8">
        <Wordmark size="sm" href="/" />
        <BackLink href="/discovery/call" />
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
        {booked ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="flex min-h-[60vh] flex-col items-center justify-center text-center"
          >
            <h1 className="font-serif text-4xl font-light tracking-tight text-ink">You’re booked.</h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-clay">
              Check your email for the confirmation. We’ve started a folder for{" "}
              <span className="text-ink">{form.brand}</span> — we’ll have your brand world ready to build the moment
              we talk.
            </p>
          </motion.div>
        ) : (
          <>
            <h1 className="mt-4 font-serif text-3xl font-light tracking-tight text-ink md:text-4xl">
              Pick a time.
            </h1>
            <p className="mt-3 text-[15px] text-clay">Thirty minutes. Bring everything you have — or nothing.</p>

            <div className="mt-8">
              <SchedulerSlot />
            </div>

            {/* The manual name/brand/email form is ONLY a fallback for when no scheduler is
               connected. With Calendly embedded, its own form handles name, email and the
               confirmation emails — so we hide this to avoid two competing booking forms. */}
            {!SCHEDULER_URL && (
              <div className="mt-8 grid gap-4">
                <Input label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <Input label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
                <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <button
                  onClick={confirm}
                  disabled={!valid || busy}
                  className="mt-2 rounded-full bg-carbon px-7 py-3 text-sm font-medium text-cream transition-opacity duration-300 ease-brand hover:opacity-90 disabled:opacity-30"
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

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-clay">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-linen bg-cream px-3.5 py-2.5 text-[15px] outline-none focus:border-ink"
      />
    </label>
  );
}
