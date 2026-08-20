"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Check, Clock, Video, Globe, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/site/theme";

/**
 * BOOK A DISCOVERY CALL — a fully native, on-brand scheduler.
 *
 * No third-party embed: the calendar, the time slots and the confirmation are all our own UI, so
 * the booking reads as an extension of tastebud, never someone else's website. Three calm steps:
 *   1. Context   — a personalized form (greets by name/brand); we learn the brand up front.
 *   2. Schedule  — our own month calendar + time-slot picker (working hours, weekdays, local tz).
 *   3. Confirmed — a branded confirmation for the exact slot they chose.
 *
 * The chosen slot + their details are captured server-side (brand pre-create) and locally. Wiring
 * real two-way calendar sync just needs a Calendly API token or an email key (see notes).
 */

const GOALS = ["Product photoshoots", "Model photoshoots", "Campaigns & Meta ads", "A full brand", "Not sure yet"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALL_MINUTES = 30;
const DAY_START = 9; // 09:00
const DAY_END = 17; // last slot ends by 17:00

type Form = { name: string; email: string; brand: string; website: string; goal: string; notes: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function BookDiscovery() {
  const [phase, setPhase] = useState<"context" | "schedule" | "done">("context");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>({ name: "", email: "", brand: "", website: "", goal: GOALS[0], notes: "" });

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.brand.trim() && /\S+@\S+\.\S+/.test(form.email);
  const firstName = form.name.trim().split(/\s+/)[0] || "";

  // Timezone resolved on the client only (avoids any SSR mismatch).
  const [tz, setTz] = useState("your local time");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time");
    } catch {}
  }, []);

  const [selected, setSelected] = useState<Date | null>(null); // chosen day
  const [slot, setSlot] = useState<Date | null>(null); // chosen start time
  const [error, setError] = useState<string | null>(null); // submission error — never fake a confirmation

  function toSchedule() {
    if (!valid || busy) return;
    setPhase("schedule");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirm() {
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    const booking = {
      ...form,
      startISO: slot.toISOString(),
      timeLabel: fmtTime(slot),
      tz,
      at: new Date().toISOString(),
    };
    try {
      localStorage.setItem("tb.booking", JSON.stringify(booking));
    } catch {}
    try {
      // Creates the Google Calendar event (native invite + Meet link) and saves the lead.
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ booking }),
      });
      const data = await res.json().catch(() => null);
      // Do NOT fake a confirmation on failure — a silent 401/500 used to show "You're booked"
      // while nothing was actually created. Surface it so the founder can retry.
      if (!res.ok || !data?.ok) {
        setBusy(false);
        setError("We couldn't confirm your booking just now. Please try again in a moment.");
        return;
      }
    } catch {
      setBusy(false);
      setError("Couldn't reach us to confirm your booking — check your connection and try again.");
      return;
    }
    setBusy(false);
    setPhase("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper text-carbon">
      <header className="flex items-center justify-between px-6 py-6 md:px-8 md:py-8">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-accent transition-opacity duration-300 hover:opacity-60">
          tastebud
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">
            <ChevronLeft size={13} /> Back
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <AnimatePresence mode="wait">
          {phase === "done" ? (
            <Confirmed key="done" form={form} slot={slot} tz={tz} />
          ) : phase === "context" ? (
            <motion.div
              key="context"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-12 py-6 md:grid-cols-2 md:gap-16 md:py-10"
            >
              {/* Left — personalized greeting */}
              <div className="md:sticky md:top-24 md:self-start">
                <p className="text-[11px] uppercase tracking-[0.2em] text-clay">Book a discovery call</p>
                <h1 className="mt-4 font-edito text-4xl font-light leading-[1.03] tracking-tight md:text-6xl">
                  {firstName ? (
                    <>
                      Let&rsquo;s build{" "}
                      <span className="text-accent">{form.brand.trim() || "your brand"}</span>,<br className="hidden md:block" /> {firstName}.
                    </>
                  ) : (
                    <>Let&rsquo;s build your brand.</>
                  )}
                </h1>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-clay md:text-[16px]">
                  Thirty focused minutes. Tell us a little now and the call starts already useful — we&rsquo;ll
                  come with your world half-built.
                </p>
                <ul className="mt-8 space-y-3">
                  {["A read on where your brand is today", "A first direction — world, palette, voice", "A plan to make your first on-brand work"].map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[14.5px] text-clay">
                      <Check size={16} className="mt-0.5 shrink-0 text-accent" /> {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right — context form */}
              <div className="rounded-[18px] border border-linen bg-cream p-7 md:p-9">
                <div className="grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input label="Your name" value={form.name} onChange={set("name")} placeholder="Kavya" autoFocus />
                    <Input label="Work email" type="email" value={form.email} onChange={set("email")} placeholder="you@brand.com" />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Input label="Brand or company" value={form.brand} onChange={set("brand")} placeholder="Willow Denim" />
                    <Input label="Website" optional value={form.website} onChange={set("website")} placeholder="yourbrand.com" />
                  </div>
                  <Select label="What do you want to make?" value={form.goal} onChange={set("goal")} options={GOALS} />
                  <Textarea label="Anything we should know?" optional value={form.notes} onChange={set("notes")} placeholder="Launching a new line next month…" />

                  <button
                    onClick={toSchedule}
                    disabled={!valid || busy}
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-carbon px-6 py-3.5 text-[12px] font-medium uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-30"
                  >
                    {busy ? "One moment…" : "Continue to pick a time"} <ArrowRight size={14} />
                  </button>
                  <p className="text-[12.5px] leading-relaxed text-clay">
                    No commitment — just a conversation. Prefer email?{" "}
                    <a href="mailto:admin@aitastebud.com" className="text-carbon underline underline-offset-4">admin@aitastebud.com</a>
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="py-4 md:py-8"
            >
              <Scheduler
                firstName={firstName}
                brand={form.brand}
                tz={tz}
                selected={selected}
                setSelected={(d) => {
                  setSelected(d);
                  setSlot(null);
                }}
                slot={slot}
                setSlot={setSlot}
                onBack={() => setPhase("context")}
                onConfirm={confirm}
                busy={busy}
                error={error}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

/* ── The native scheduler (calendar + slots) ─────────────────────────────────*/
function Scheduler({
  firstName,
  brand,
  tz,
  selected,
  setSelected,
  slot,
  setSlot,
  onBack,
  onConfirm,
  busy,
  error,
}: {
  firstName: string;
  brand: string;
  tz: string;
  selected: Date | null;
  setSelected: (d: Date) => void;
  slot: Date | null;
  setSlot: (d: Date) => void;
  onBack: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  const isPastMonth = view.y < today.getFullYear() || (view.y === today.getFullYear() && view.m <= today.getMonth());
  const maxReached = view.y > today.getFullYear() + 1 || (view.y === today.getFullYear() + 1 && view.m >= today.getMonth()); // ~1 year out

  const cells = useMemo(() => {
    const firstWeekday = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= days; d++) arr.push(new Date(view.y, view.m, d));
    return arr;
  }, [view]);

  const selectable = (d: Date) => {
    const wd = d.getDay();
    return d >= today && wd !== 0 && wd !== 6; // weekdays, today onward
  };

  const slots = useMemo(() => {
    if (!selected) return [];
    const now = new Date();
    const out: Date[] = [];
    for (let h = DAY_START; h < DAY_END; h++) {
      for (const min of [0, 30]) {
        const s = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, min);
        if (sameDay(selected, now) && s.getTime() < now.getTime() + 60 * 60 * 1000) continue; // ≥1h out today
        out.push(s);
      }
    }
    return out;
  }, [selected]);

  return (
    <div className="grid gap-10 lg:grid-cols-[300px_1fr] lg:gap-14">
      {/* Info rail */}
      <div>
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-clay transition-colors hover:text-carbon">
          <Pencil size={12} /> Edit details
        </button>
        <p className="text-[11px] uppercase tracking-[0.2em] text-clay">tastebud · discovery</p>
        <h1 className="mt-3 font-edito text-3xl font-light leading-tight tracking-tight md:text-4xl">
          Pick a time{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="mt-4 max-w-xs text-[14.5px] leading-relaxed text-clay">
          Choose whatever suits you — we&rsquo;ll come with{" "}
          <span className="text-carbon">{brand.trim() || "your brand"}</span> half-built.
        </p>
        <ul className="mt-7 space-y-3.5 border-t border-linen pt-7">
          <Meta icon={<Clock size={15} />} label={`${CALL_MINUTES} minutes`} />
          <Meta icon={<Video size={15} />} label="Video call — link on confirm" />
          <Meta icon={<Globe size={15} />} label={tz.replace(/_/g, " ")} />
        </ul>
      </div>

      {/* Calendar + slots */}
      <div className="grid gap-8 sm:grid-cols-[1fr_240px]">
        {/* Calendar */}
        <div className="rounded-[18px] border border-linen bg-cream p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-edito text-lg tracking-tight text-carbon">
              {MONTHS[view.m]} {view.y}
            </span>
            <div className="flex items-center gap-1">
              <NavBtn
                disabled={isPastMonth}
                onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
                aria="Previous month"
              >
                <ChevronLeft size={16} />
              </NavBtn>
              <NavBtn
                disabled={maxReached}
                onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
                aria="Next month"
              >
                <ChevronRight size={16} />
              </NavBtn>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.08em] text-clay">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1.5">{w[0]}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} />;
              const ok = selectable(d);
              const isSel = selected && sameDay(d, selected);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  disabled={!ok}
                  onClick={() => setSelected(d)}
                  className={`relative flex aspect-square items-center justify-center rounded-full text-[14px] transition-colors duration-200 ${
                    isSel
                      ? "bg-accent font-medium text-white"
                      : ok
                      ? "text-carbon hover:bg-carbon/[0.06]"
                      : "cursor-default text-clay/35"
                  }`}
                >
                  {d.getDate()}
                  {isToday && !isSel && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots */}
        <div className="flex flex-col">
          <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-clay">
            {selected
              ? selected.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
              : "Select a day"}
          </p>
          {!selected ? (
            <div className="flex flex-1 items-center rounded-[14px] border border-dashed border-linen px-5 py-10 text-[14px] leading-relaxed text-clay">
              Pick a day on the left to see open times.
            </div>
          ) : slots.length === 0 ? (
            <div className="flex flex-1 items-center rounded-[14px] border border-dashed border-linen px-5 py-10 text-[14px] leading-relaxed text-clay">
              No times left that day — try another.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:max-h-[360px] sm:overflow-y-auto sm:pr-1">
              {slots.map((s) => {
                const isSel = slot && s.getTime() === slot.getTime();
                return (
                  <button
                    key={s.toISOString()}
                    onClick={() => setSlot(s)}
                    className={`rounded-full border px-4 py-3 text-center text-[14px] font-medium transition-colors duration-200 ${
                      isSel
                        ? "border-accent bg-accent text-white"
                        : "border-linen text-carbon hover:border-accent/60 hover:bg-carbon/[0.03]"
                    }`}
                  >
                    {fmtTime(s)}
                  </button>
                );
              })}
            </div>
          )}

          {slot && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onConfirm}
              disabled={busy}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-carbon px-6 py-3.5 text-[12px] font-medium uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-40"
            >
              {busy ? "Confirming…" : `Confirm ${fmtTime(slot)}`} <ArrowRight size={14} />
            </motion.button>
          )}
          {error && (
            <p className="mt-3 text-[13px] leading-relaxed text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3 text-[14px] text-carbon">
      <span className="text-accent">{icon}</span>
      {label}
    </li>
  );
}

function NavBtn({ children, onClick, disabled, aria }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; aria: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="flex h-8 w-8 items-center justify-center rounded-full text-carbon transition-colors hover:bg-carbon/[0.06] disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/* ── Confirmation ────────────────────────────────────────────────────────────*/
function Confirmed({ form, slot, tz }: { form: Form; slot: Date | null; tz: string }) {
  const when = slot
    ? `${slot.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · ${fmtTime(slot)}`
    : "your selected time";
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-[62vh] flex-col items-center justify-center text-center"
    >
      <span className="mb-8 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
        <Check size={26} />
      </span>
      <h1 className="font-edito text-4xl font-light tracking-tight md:text-5xl">You&rsquo;re booked.</h1>
      <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-carbon">{when}</p>
      <p className="mt-2 text-[13px] uppercase tracking-[0.14em] text-clay">{tz.replace(/_/g, " ")}</p>
      <p className="mx-auto mt-6 max-w-sm text-[15px] leading-relaxed text-clay">
        A Google Calendar invite with a Meet link is on its way to <span className="text-carbon">{form.email}</span> —
        just hit <span className="text-carbon">Yes</span> to confirm. We&rsquo;ve started a folder for{" "}
        <span className="text-carbon">{form.brand.trim() || "your brand"}</span> — we&rsquo;ll have your world ready to
        build the moment we talk.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
        <Link href="/" className="rounded-full border border-carbon/25 px-6 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-carbon transition-colors duration-300 hover:bg-carbon hover:text-paper">
          Back home
        </Link>
        <Link href="/asset-studio" className="rounded-full bg-carbon px-6 py-3 text-[12px] font-medium uppercase tracking-[0.14em] text-paper transition-colors duration-300 hover:bg-carbon/85">
          See what&rsquo;s coming in Asset Studio
        </Link>
      </div>
    </motion.div>
  );
}

/* ── Fields (themed) ─────────────────────────────────────────────────────────*/
const fieldCls =
  "w-full rounded-[10px] border border-linen bg-paper px-3.5 py-2.5 text-[15px] text-carbon placeholder:text-clay/60 outline-none transition-colors focus:border-carbon";

function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-clay">
      {label}
      {optional && <span className="ml-1.5 text-[10px] normal-case tracking-normal text-clay/70">(optional)</span>}
    </span>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  optional,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  optional?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} optional={optional} />
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className={fieldCls} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} optional={optional} />
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className={fieldCls} />
    </label>
  );
}
