"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * BRAND SWITCHER — the header brand picker. Lists every saved brain and, on select, locks the
 * WHOLE workspace to that brand (palette, voice, guidelines) via the parent's `onSelect`. The
 * companion to the conversational brand-selection agent (select_brand) — same switch, two doors.
 */
type BrandMeta = { slug: string; name: string };

export function BrandSwitcher({ current, onSelect }: { current?: string; onSelect: (slug: string) => void }) {
  const router = useRouter();
  const [brains, setBrains] = useState<BrandMeta[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load the saved brands whenever the menu opens (cheap, and always fresh after a new brand lands).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/brains")
      .then((r) => r.json())
      .then((j) => { if (alive) setBrains(((j?.brains ?? []) as BrandMeta[]).filter((b) => b?.name)); })
      .catch(() => { if (alive) setBrains([]); });
    return () => { alive = false; };
  }, [open]);

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} data-no-pan className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch brand — locks every creative to it"
        className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink" />
        <span className="max-w-[10rem] truncate font-medium">{current || "Pick a brand"}</span>
        <ChevronDown size={13} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 max-h-[60vh] w-56 overflow-auto rounded-card border border-hairline bg-canvas py-1 shadow-lg">
          {brains.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No saved brands yet.</div>}
          {brains.map((b) => (
            <button
              key={b.slug}
              onClick={() => { setOpen(false); if (b.name !== current) onSelect(b.slug); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface"
            >
              <span className="flex-1 truncate">{b.name}</span>
              {b.name === current && <Check size={13} className="text-ink" />}
            </button>
          ))}
          <div className="my-1 border-t border-hairline" />
          <button
            onClick={() => { setOpen(false); router.push("/studio"); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Plus size={13} /> New brand
          </button>
        </div>
      )}
    </div>
  );
}
