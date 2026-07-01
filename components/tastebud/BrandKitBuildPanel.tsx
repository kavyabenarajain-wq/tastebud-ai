"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Globe } from "lucide-react";
import { useStudio } from "@/components/tastebud/StudioSession";

/**
 * The live "BUILDING YOUR BRAND KIT" rail shown beside the questionnaire steps.
 * It fills in — Source, Logo, Palette, Type, Voice, Workspace — as the background
 * research streams in, so answering the quick questions and watching the brand kit
 * assemble happen at the same time. Pure read from the studio session; no props.
 */

/** Repair tiny Shopify favicon-sized logos (?width=32 → 480). */
function bigLogo(url?: string): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (/\/cdn\/shop\/|cdn\.shopify|\/cdn\//.test(u.href)) {
      u.searchParams.delete("crop");
      u.searchParams.delete("height");
      u.searchParams.set("width", "480");
    }
    return u.toString();
  } catch {
    return url;
  }
}

const Shimmer = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-control bg-surface ${className}`} />
);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function BrandKitBuildPanel() {
  const { brain, research } = useStudio();
  const d = research.details;
  const intel = brain.intelligence;

  const site = (brain.website || d.website || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const logo = bigLogo(intel?.logo);
  const palette = (d.palette?.length ? d.palette : intel?.palette) ?? [];
  const typeName = intel?.typography?.text || intel?.typography?.display || "";
  const voice = intel?.toneOfVoice || "";
  const uses = brain.uses ?? [];

  const signals = [!!site, palette.length > 0, !!typeName, !!voice, research.done];
  const pct = research.done ? 100 : Math.max(8, Math.round((signals.filter(Boolean).length / signals.length) * 100));

  const status = !research.started
    ? "Getting ready"
    : research.done
      ? "Brand kit ready"
      : voice
        ? "Polishing the details"
        : typeName
          ? "Finding your tone"
          : palette.length
            ? "Polishing the type"
            : site
              ? "Pulling your palette"
              : "Reading your site";

  return (
    <aside className="rounded-card border border-hairline bg-surface/40 p-7">
      <div className="text-[11px] uppercase tracking-wide text-muted">Building your brand kit</div>

      {/* Progress rail */}
      <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-hairline">
        <motion.div className="h-full rounded-full bg-ink" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px] text-ink">
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-ink"
          animate={research.done ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: research.done ? 0 : Infinity }}
        />
        {status}
      </div>

      <div className="mt-7 space-y-6">
        <Field label="Source">
          {site ? (
            <span className="inline-flex items-center gap-2 rounded-control border border-hairline bg-canvas px-3 py-1.5 text-[13px] text-ink">
              <Globe size={13} className="text-muted" /> {site}
            </span>
          ) : (
            <Shimmer className="h-8 w-40" />
          )}
        </Field>

        <Field label="Logo">
          {logo ? (
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-control border border-hairline bg-canvas p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
            </div>
          ) : (
            <Shimmer className="h-14 w-14" />
          )}
        </Field>

        <Field label="Palette">
          {palette.length ? (
            <div className="flex flex-wrap gap-1.5">
              {palette.slice(0, 6).map((c, i) => (
                <motion.span key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} title={c.hex} className="h-9 w-9 rounded-control border border-hairline" style={{ background: c.hex }} />
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} className="h-9 w-9" />)}</div>
          )}
        </Field>

        <Field label="Type">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-3xl font-light leading-none text-ink">Aa</span>
            <AnimatePresence mode="wait">
              <motion.span key={typeName || "pending"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-[13px] ${typeName ? "text-ink" : "italic text-muted"}`}>
                {typeName || "Reading typeface…"}
              </motion.span>
            </AnimatePresence>
          </div>
        </Field>

        <Field label="Voice">
          <span className={`text-[13px] ${voice ? "text-ink" : "italic text-muted"}`}>{voice || "Finding your tone…"}</span>
        </Field>

        <Field label="Workspace">
          {uses.length ? (
            <div className="flex flex-wrap gap-1.5">
              {uses.map((u) => <span key={u} className="rounded-full border border-hairline bg-canvas px-2.5 py-1 text-[12px] text-ink">{u}</span>)}
            </div>
          ) : (
            <span className="text-[13px] italic text-muted">Choosing what you make…</span>
          )}
        </Field>
      </div>
    </aside>
  );
}
