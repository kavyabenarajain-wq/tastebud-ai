"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Upload, Check, ImageIcon } from "lucide-react";
import { thumb } from "@/lib/thumb";
import type { StudioProduct } from "@/lib/types";

/**
 * The brand's product library as a slide-over — opened from the workspace so the chat
 * stays clean (no product thumbnails cluttering the conversation). Browse the scraped
 * catalogue, add/remove products from the shoot, and upload your own here.
 */

type ShootItem = { name: string; url: string };

export function ProductLibraryPanel({
  open, onClose, brandName, catalog, products, onAdd, onRemove, onUpload,
}: {
  open: boolean;
  onClose: () => void;
  brandName?: string;
  catalog: StudioProduct[];
  products: ShootItem[];
  onAdd: (p: ShootItem) => void;
  onRemove: (url: string) => void;
  onUpload: (files: FileList | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inShoot = (url?: string) => !!url && products.some((p) => p.url === url);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/20"
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[92vw] flex-col border-l border-hairline bg-canvas"
          >
            <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted">{brandName ? `${brandName} · library` : "Product library"}</div>
                <div className="mt-0.5 font-serif text-xl font-light tracking-tight text-ink">Your products</div>
              </div>
              <button onClick={onClose} className="text-muted transition-colors hover:text-ink"><X size={18} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {/* In this shoot */}
              {products.length > 0 && (
                <div className="mb-8">
                  <div className="mb-3 text-[10px] uppercase tracking-wide text-muted">In this shoot · {products.length}</div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {products.map((p, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-md border border-ink/30 bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb(p.url, 240)} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        <button onClick={() => onRemove(p.url)} className="absolute right-1 top-1 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block" title="Remove from shoot"><X size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* The scraped catalogue */}
              {catalog.length > 0 ? (
                <>
                  <div className="mb-3 text-[10px] uppercase tracking-wide text-muted">Library · {catalog.length}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {catalog.map((p) => {
                      const url = p.images[0];
                      const on = inShoot(url);
                      return (
                        <button
                          key={p.id}
                          onClick={() => (url ? (on ? onRemove(url) : onAdd({ name: p.name, url })) : undefined)}
                          disabled={!url}
                          className={`group overflow-hidden rounded-card border bg-canvas text-left transition-all duration-200 hover:shadow-card disabled:opacity-50 ${on ? "border-ink ring-1 ring-ink" : "border-hairline"}`}
                        >
                          <div className="relative aspect-square w-full overflow-hidden bg-surface">
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb(url, 400)} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-hairline"><ImageIcon size={22} strokeWidth={1.5} /></div>
                            )}
                            <span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition-all ${on ? "border-ink bg-ink text-canvas" : "border-hairline bg-canvas/80 text-transparent group-hover:border-ink"}`}>
                              <Check size={11} strokeWidth={2.5} />
                            </span>
                          </div>
                          <div className="px-2.5 py-2">
                            <div className="truncate text-[13px] text-ink">{p.name}</div>
                            {(p.collection || p.category) && <div className="truncate text-[11px] text-muted">{[p.collection, p.category].filter(Boolean).join(" · ")}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-[14px] leading-relaxed text-muted">No scraped products for this brand. Upload your own below.</p>
              )}
            </div>

            <div className="border-t border-hairline px-6 py-4">
              <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-control border border-hairline px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink">
                <Upload size={15} /> Upload your own
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onUpload(e.target.files); e.currentTarget.value = ""; }} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
