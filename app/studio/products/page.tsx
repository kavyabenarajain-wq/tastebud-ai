"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Check, Upload, ImageIcon } from "lucide-react";
import { OnboardHeader } from "@/components/tastebud/OnboardHeader";
import { useStudio } from "@/components/tastebud/StudioSession";
import { thumb } from "@/lib/thumb";
import { detectCategory, coerceCategory, type ProductCategory } from "@/lib/productCategory";
import type { StudioProduct } from "@/lib/types";

/**
 * STEP 5 — Product Library.
 * Every product the AI scraped, ready to shoot — no upload needed. Products only (the scraper drops
 * gift cards, shipping protection and the like) and cleanly categorised, so the library reads as an
 * ordered catalogue. Select one or many; the choices become the assets for generation. If nothing
 * was found on the site, a quiet upload fallback keeps the flow moving.
 */

const uid = (): string => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `up-${Math.random().toString(36).slice(2)}`);

/** Short, human display labels for the filter chips (the enum is the source of truth). */
const CAT_LABEL: Record<ProductCategory, string> = {
  food: "Food", drink: "Drinks", apparel: "Apparel", jewellery: "Jewellery", beauty: "Beauty",
  wellness: "Wellness", furniture: "Furniture", tech: "Tech", home: "Home", general: "Other",
};

/** Hard, physically-distinct categories — a merch tee in a soda store is genuinely apparel; a flavour
 *  called "Peaches & Cream" is NOT beauty. Only these override the brand's own category. */
const HARD_GOODS = new Set<ProductCategory>(["apparel", "jewellery", "furniture", "tech", "home"]);

/** The clean category a product belongs to, biased to the BRAND's category. Consumable-brand flavour
 *  collisions (cream→beauty, crisp→food, prebiotic→wellness) collapse to the brand category; only a
 *  genuinely different HARD good (merch) keeps its own. Fed just name + type (not the noisy copy). */
const catOfWith = (p: StudioProduct, brandCat?: ProductCategory): ProductCategory => {
  const d = detectCategory(p.name, p.category);
  if (!brandCat) return d;
  return d !== brandCat && HARD_GOODS.has(d) ? d : brandCat;
};

export default function ProductLibrary() {
  const router = useRouter();
  const { brain, hydrated, catalog, selectedIds, toggleProduct, clearSelection, patch } = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [healing, setHealing] = useState(false);
  const [activeCat, setActiveCat] = useState<ProductCategory | "all">("all");
  const healRan = useRef(false);

  useEffect(() => {
    if (hydrated && !brain.name) router.replace("/studio");
  }, [hydrated, brain.name, router]);

  // Self-heal a catalogue that came back as names with NO photos (e.g. a Shopify site whose saved
  // URL carried a `?srsltid=` tracking query that used to break harvesting). If most products lack
  // an image and we know the site, re-harvest it straight from the live site — this time WITH images
  // (and clean names) — and swap the library in. Runs once; a healthy catalogue is left untouched.
  useEffect(() => {
    if (!hydrated || healRan.current) return;
    const cat = brain.catalog ?? [];
    if (!cat.length) return;
    const withImg = cat.filter((p) => p.images?.[0]).length;
    const site = brain.website || brain.research?.website;
    if (!site || withImg / cat.length >= 0.5) return; // healthy enough, or nowhere to re-harvest
    healRan.current = true;
    setHealing(true);
    fetch("/api/studio/catalog/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ website: site }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { catalog?: StudioProduct[]; logo?: string } | null) => {
        const fresh = data?.catalog ?? [];
        const freshWith = fresh.filter((p) => p.images?.[0]).length;
        // Only replace if the re-harvest genuinely recovered more photos than we had.
        if (fresh.length && freshWith > withImg) {
          setFailed(new Set());
          patch({ catalog: fresh, selectedProductIds: [] });
        }
      })
      .catch(() => {})
      .finally(() => setHealing(false));
  }, [hydrated, brain.catalog, brain.website, brain.research?.website, patch]);

  const brandCat = useMemo(() => coerceCategory(brain.category), [brain.category]);
  const catFor = useMemo(() => {
    const cache = new Map<string, ProductCategory>();
    return (p: StudioProduct): ProductCategory => {
      const hit = cache.get(p.id);
      if (hit) return hit;
      const c = catOfWith(p, brandCat);
      cache.set(p.id, c);
      return c;
    };
  }, [brandCat]);

  // Clean category buckets, ordered by size — the filter rail + the "categorised" read.
  const cats = useMemo(() => {
    const count = new Map<ProductCategory, number>();
    for (const p of catalog) count.set(catFor(p), (count.get(catFor(p)) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [catalog, catFor]);

  const shown = useMemo(
    () => (activeCat === "all" ? catalog : catalog.filter((p) => catFor(p) === activeCat)),
    [catalog, activeCat, catFor],
  );

  // If the catalog changes (upload, self-heal) and the active category no longer has any products,
  // fall back to "All" so the grid never goes blank on a stale filter.
  useEffect(() => {
    if (activeCat !== "all" && !catalog.some((p) => catFor(p) === activeCat)) setActiveCat("all");
  }, [catalog, activeCat, catFor]);

  function addUploads(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    let pending = list.length;
    const added: StudioProduct[] = [];
    // Commit whatever read successfully once every file has resolved OR errored — a single
    // unreadable file must not leave `pending` above zero and silently drop the whole batch.
    const finish = () => {
      if (--pending > 0) return;
      if (added.length) patch({ catalog: [...(brain.catalog ?? []), ...added], selectedProductIds: [...(brain.selectedProductIds ?? []), ...added.map((p) => p.id)] });
      setActiveCat("all"); // show the freshly-added items even if a category was filtered
    };
    list.forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => { added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), images: [String(rd.result)] }); finish(); };
      rd.onerror = finish;
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
  const showFilters = catalog.length > 0 && cats.length > 1;

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <OnboardHeader step={5} back="/studio/intelligence" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-40">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="flex flex-wrap items-end justify-between gap-4 py-10">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-muted">{brain.name} · library</span>
            <h1 className="mt-3 font-serif text-4xl font-light tracking-tight text-ink md:text-5xl">Your products</h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
              {healing
                ? "Fetching your product photos from your site…"
                : catalog.length > 0
                ? "Pulled straight from your site — no uploads. Pick the ones you want to create with."
                : "I couldn't pull products automatically. Drop a few in and we'll shoot those."}
            </p>
          </div>
          {catalog.length > 0 && (
            <div className="flex items-center gap-4 text-[14px]">
              <button onClick={() => fileRef.current?.click()} className="text-muted transition-colors hover:text-ink">Add your own</button>
              <span className="text-hairline">·</span>
              {/* Scoped to the visible set — "Select all" while a category is filtered selects only that category. */}
              <button onClick={() => patch({ selectedProductIds: Array.from(new Set([...selectedIds, ...shown.map((p) => p.id)])) })} className="text-muted transition-colors hover:text-ink">
                {activeCat === "all" ? "Select all" : "Select these"}
              </button>
              {count > 0 && <button onClick={clearSelection} className="text-muted transition-colors hover:text-ink">Clear</button>}
            </div>
          )}
        </motion.div>

        {/* Category filter rail — the clean, derived categorisation (only when it earns its place). */}
        {showFilters && (
          <div className="-mx-1 mb-8 flex flex-wrap gap-2">
            <FilterChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" n={catalog.length} />
            {cats.map(([c, n]) => (
              <FilterChip key={c} active={activeCat === c} onClick={() => setActiveCat(c)} label={CAT_LABEL[c]} n={n} />
            ))}
          </div>
        )}

        {catalog.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {shown.map((p, i) => {
              const on = selectedIds.includes(p.id);
              const img = failed.has(p.id) ? undefined : p.images[0];
              // Subtitle = the real, clean collection/type only (never the junk Shopify tags); blank
              // otherwise — the name carries the card, and the filter rail carries the category.
              const meta = p.collection || "";
              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  // Enter animation staggers; the layout reflow (on filter change) must NOT inherit
                  // that per-card delay, or cards cascade sluggishly into place when a filter flips.
                  transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.4, 0, 0.2, 1], layout: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
                  onClick={() => toggleProduct(p.id)}
                  className={`group overflow-hidden rounded-card border bg-canvas text-left transition-all duration-200 ease-brand hover:shadow-card ${on ? "border-ink ring-1 ring-ink" : "border-hairline"}`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(img)} alt={p.name} loading="lazy" decoding="async" onError={() => setFailed((s) => new Set(s).add(p.id))} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-hairline"><ImageIcon size={26} strokeWidth={1.5} /></div>
                    )}
                    <span className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ${on ? "border-ink bg-ink text-canvas" : "border-hairline bg-canvas/80 text-transparent group-hover:border-ink"}`}>
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  </div>
                  <div className="px-3.5 py-3">
                    <div className="truncate text-[14px] font-medium text-ink">{p.name}</div>
                    <div className="mt-0.5 min-h-[1rem] truncate text-[12px] text-muted">{meta}</div>
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

/** A quiet, hairline filter pill with a count — active state fills ink. */
function FilterChip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-all duration-200 ease-brand ${
        active ? "border-ink bg-ink text-canvas" : "border-hairline text-muted hover:border-ink hover:text-ink"
      }`}
    >
      {label}
      <span className={active ? "text-canvas/60" : "text-muted/60"}>{n}</span>
    </button>
  );
}
