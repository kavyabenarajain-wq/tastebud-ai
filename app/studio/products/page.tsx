"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Check, Upload, ImageIcon } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { useStudio } from "@/components/tastebud/StudioSession";
import { thumb } from "@/lib/thumb";
import type { StudioProduct } from "@/lib/types";

/**
 * STEP 5 — Product Library.
 * Every product the AI scraped, ready to shoot — no upload needed. Select one or many;
 * the choices become the assets for generation. If nothing was found on the site, a
 * quiet upload fallback keeps the flow moving.
 */

const uid = (): string => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `up-${Math.random().toString(36).slice(2)}`);

export default function ProductLibrary() {
  const router = useRouter();
  const { brain, hydrated, catalog, selectedIds, toggleProduct, selectAll, clearSelection, patch } = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hydrated && !brain.name) router.replace("/studio");
  }, [hydrated, brain.name, router]);

  function addUploads(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    let pending = list.length;
    const added: StudioProduct[] = [];
    list.forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => {
        added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), images: [String(rd.result)] });
        if (--pending === 0) {
          const nextCatalog = [...(brain.catalog ?? []), ...added];
          patch({ catalog: nextCatalog, selectedProductIds: [...(brain.selectedProductIds ?? []), ...added.map((p) => p.id)] });
        }
      };
      rd.readAsDataURL(f);
    });
  }

  function proceed() {
    if (!selectedIds.length) return;
    // Straight into the unified workspace — the creative-type filter (from brain.uses)
    // replaces the old Product/Model fork at /studio/choose.
    router.push("/studio/create");
  }

  const count = selectedIds.length;

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={5} back="/studio/intelligence" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-40">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="flex flex-wrap items-end justify-between gap-4 py-10">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted">{brain.name} · library</span>
            <h1 className="mt-3 font-serif text-4xl font-light tracking-tight text-ink md:text-5xl">Your products</h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
              {catalog.length > 0
                ? "Pulled straight from your site — no uploads. Pick the ones you want to create with."
                : "I couldn't pull products automatically. Drop a few in and we'll shoot those."}
            </p>
          </div>
          {catalog.length > 0 && (
            <div className="flex items-center gap-4 text-[14px]">
              <button onClick={() => fileRef.current?.click()} className="text-muted transition-colors hover:text-ink">Add your own</button>
              <span className="text-hairline">·</span>
              <button onClick={selectAll} className="text-muted transition-colors hover:text-ink">Select all</button>
              {count > 0 && <button onClick={clearSelection} className="text-muted transition-colors hover:text-ink">Clear</button>}
            </div>
          )}
        </motion.div>

        {catalog.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {catalog.map((p, i) => {
              const on = selectedIds.includes(p.id);
              const img = p.images[0];
              return (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.4, 0, 0.2, 1] }}
                  onClick={() => toggleProduct(p.id)}
                  className={`group overflow-hidden rounded-card border bg-canvas text-left transition-all duration-200 ease-brand hover:shadow-card ${on ? "border-ink ring-1 ring-ink" : "border-hairline"}`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(img)} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-hairline"><ImageIcon size={26} strokeWidth={1.5} /></div>
                    )}
                    <span className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ${on ? "border-ink bg-ink text-canvas" : "border-hairline bg-canvas/80 text-transparent group-hover:border-ink"}`}>
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  </div>
                  <div className="px-3.5 py-3">
                    <div className="truncate text-[14px] font-medium text-ink">{p.name}</div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      {[p.collection, p.category].filter(Boolean).join(" · ") || (p.price ? p.price : " ")}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hairline text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <Upload size={26} strokeWidth={1.5} />
            <span className="text-[15px]">Drop product images here</span>
            <span className="text-[13px] text-muted">or click to browse</span>
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addUploads(e.target.files)} />
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-hairline bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-[14px] text-muted">
            {count > 0 ? <><span className="text-ink">{count}</span> selected</> : "Select the products you want to shoot"}
          </span>
          <button
            onClick={proceed}
            disabled={count === 0}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
