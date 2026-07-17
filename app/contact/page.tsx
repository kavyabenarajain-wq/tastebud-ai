"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const inputCls =
  "w-full rounded-xl border border-linen bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-clay/60 outline-none transition-colors focus:border-ink";

/**
 * CONTACT — book the first demo call.
 * Flow 1 of the site: submit → the call is booked → confirmation with next steps.
 * Front-end only for now; the request is kept locally so wiring a backend is a drop-in.
 */
export default function Contact() {
  const [booked, setBooked] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    brand: "",
    website: "",
    making: "Product photoshoots",
    when: "This week",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("tb.demoRequest", JSON.stringify({ ...form, at: new Date().toISOString() }));
    } catch {}
    setBooked(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="bg-cream text-ink">
      <SiteHeader />

      <div className="mx-auto max-w-2xl px-6 pb-28 pt-44">
        {booked ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="text-center"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-carbon text-2xl text-cream">
              ✓
            </span>
            <h1 className="mt-8 font-site-serif text-5xl font-light tracking-tight">
              Your call is booked.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed text-clay">
              We&rsquo;ll send a calendar invite to <span className="text-ink">{form.email}</span> within
              the day. Thirty minutes; bring your products, or just a link to them.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/"
                className="rounded-xl border border-linen bg-paper px-6 py-3 text-[15px] text-ink transition-colors duration-300 hover:border-ink"
              >
                Back home
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl bg-carbon px-6 py-3 text-[15px] font-medium text-cream transition-opacity duration-300 hover:opacity-85"
              >
                Try the studio while you wait
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <p className="text-center text-[12px] uppercase tracking-wide text-clay">Contact</p>
            <h1 className="mt-6 text-center font-site-serif text-5xl font-light tracking-tight">
              Book your first demo.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-center text-[16px] leading-relaxed text-clay">
              Tell us where to reach you and what you make. We&rsquo;ll bring the studio.
            </p>

            <form onSubmit={submit} className="mt-12 space-y-5 rounded-3xl border border-linen bg-paper p-8 md:p-10">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Your name">
                  <input required value={form.name} onChange={set("name")} placeholder="Kavya" className={inputCls} />
                </Field>
                <Field label="Work email">
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@brand.com"
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Brand or company">
                  <input value={form.brand} onChange={set("brand")} placeholder="Willow Denim" className={inputCls} />
                </Field>
                <Field label="Website" optional>
                  <input value={form.website} onChange={set("website")} placeholder="yourbrand.com" className={inputCls} />
                </Field>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="What do you want to make?">
                  <select value={form.making} onChange={set("making")} className={inputCls}>
                    <option>Product photoshoots</option>
                    <option>Model photoshoots</option>
                    <option>Campaigns &amp; Meta ads</option>
                    <option>Everything</option>
                    <option>Not sure yet</option>
                  </select>
                </Field>
                <Field label="When suits you?">
                  <select value={form.when} onChange={set("when")} className={inputCls}>
                    <option>This week</option>
                    <option>Next week</option>
                    <option>Just curious for now</option>
                  </select>
                </Field>
              </div>
              <Field label="Anything we should know?" optional>
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={3}
                  placeholder="Launching a new line next month…"
                  className={inputCls}
                />
              </Field>

              <button
                type="submit"
                className="mt-2 w-full rounded-xl bg-carbon px-4 py-3.5 text-[15px] font-medium text-cream transition-opacity duration-300 hover:opacity-85"
              >
                Book the call
              </button>
              <p className="text-center text-[13px] text-clay">
                Prefer email? Write to <span className="text-ink">hello@tastebud.studio</span>
              </p>
            </form>
          </motion.div>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="ml-1.5 text-[12px] font-normal text-clay">(optional)</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
