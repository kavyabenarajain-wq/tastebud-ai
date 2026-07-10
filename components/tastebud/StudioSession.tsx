"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BrandBrain, StudioProduct } from "@/lib/types";

/**
 * The Asset Studio onboarding session — the working Brand Brain carried across the
 * page-based flow (Source → About → Focus → Building → Intelligence → Products →
 * Shoot). Mounted once in app/studio/layout.tsx so it survives navigation between
 * child routes without prop-drilling, and mirrored to localStorage["cc.activeBrand"]
 * — the same handoff key the generation workspaces already read.
 *
 * Crucially, the brand RESEARCH runs here (not on a single page): the moment the user
 * pastes their site it streams in the BACKGROUND while they answer the questionnaire,
 * exactly like the "we'll build your brand kit while you answer a couple of quick
 * questions" promise. Any onboarding screen can read `research` for a live panel.
 */

const KEY = "cc.activeBrand";

export type ResearchDetails = {
  website?: string;
  instagram?: string;
  competitors?: string[];
  productCount?: number;
  imageCount?: number;
  palette?: { hex: string; role?: string }[];
};

export type ResearchState = {
  started: boolean;
  running: boolean;
  done: boolean;
  error: boolean;
  details: ResearchDetails;
};

interface StudioCtx {
  brain: BrandBrain;
  hydrated: boolean;
  catalog: StudioProduct[];
  selectedIds: string[];
  selectedProducts: StudioProduct[];
  research: ResearchState;
  setName: (name: string) => void;
  setCategory: (category: string) => void;
  setBrain: (b: BrandBrain) => void;
  patch: (p: Partial<BrandBrain>) => void;
  /** Wipe the previous brand + reset the research guard so a newly pasted URL starts clean. */
  resetForNewBrand: () => void;
  toggleProduct: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  /** Kick off (or resume) background research. Safe to call more than once — runs once. */
  startResearch: (opts?: { website?: string; name?: string; category?: string }) => void;
  /**
   * Start researching the MOMENT a real URL lands in the box (on paste or as typing settles),
   * before the user commits. Idempotent per host: re-firing for the same site is a no-op; a
   * genuinely new site cancels the old run and starts clean. No-op until the text is a real domain.
   */
  speculateResearch: (website: string) => void;
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [brain, setBrainState] = useState<BrandBrain>({});
  const [hydrated, setHydrated] = useState(false);
  const [research, setResearch] = useState<ResearchState>({
    started: false, running: false, done: false, error: false, details: {},
  });
  const researchRan = useRef(false);
  const researchKeyRef = useRef("");                        // host we're currently researching — one run per site
  const runTokenRef = useRef(0);                             // bumps on every (re)start; stale runs stop updating state
  const abortRef = useRef<AbortController | null>(null);     // lets an abandoned run stop hitting the network

  // Invalidate whatever run is in flight: bump the token so its state writes are ignored,
  // and abort its fetch. Called before starting a new site and when wiping a brand.
  const cancelResearch = useCallback(() => {
    runTokenRef.current++;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    abortRef.current = null;
  }, []);

  // Hydrate once from the shared session key.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const b = JSON.parse(raw) as BrandBrain;
        if (b && typeof b === "object") {
          setBrainState(b);
          if (b.ready) setResearch((r) => ({ ...r, started: true, done: true }));
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist on every change (after hydration, so we never clobber saved state with {}).
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(KEY, JSON.stringify(brain)); } catch { /* ignore */ }
  }, [brain, hydrated]);

  const patch = useCallback((p: Partial<BrandBrain>) => setBrainState((b) => ({ ...b, ...p })), []);
  const setBrain = useCallback((b: BrandBrain) => setBrainState(b), []);
  const setName = useCallback((name: string) => setBrainState((b) => ({ ...b, name })), []);
  const setCategory = useCallback((category: string) => setBrainState((b) => ({ ...b, category })), []);

  // Starting a DIFFERENT brand: wipe everything brand-specific (name, site, research, intelligence,
  // catalog, product picks, memory, questionnaire answers, the ready flag) AND reset the
  // once-per-session research guard — otherwise a newly pasted URL keeps showing the previous
  // brand and never re-researches. Only genuinely user-level facts (role, team) carry over.
  const resetForNewBrand = useCallback(() => {
    cancelResearch();
    researchRan.current = false;
    researchKeyRef.current = "";
    setResearch({ started: false, running: false, done: false, error: false, details: {} });
    setBrainState((b) => ({ role: b.role, brandType: b.brandType, teamSize: b.teamSize }));
  }, [cancelResearch]);

  const startResearch = useCallback((opts?: { website?: string; name?: string; category?: string }) => {
    if (researchRan.current) return;
    researchRan.current = true;
    if (opts?.website) researchKeyRef.current = normUrl(opts.website);

    // Tag this run. If a newer run starts (or the brand is wiped), `live()` goes false and
    // this run stops writing state / hitting the network — an abandoned speculative research
    // can never clobber the next brand.
    const controller = new AbortController();
    abortRef.current = controller;
    const myRun = ++runTokenRef.current;
    const live = () => runTokenRef.current === myRun && !controller.signal.aborted;

    setResearch((r) => ({ ...r, started: true, running: true }));

    (async () => {
      // Pull latest identity from state at call time.
      let name = opts?.name;
      let category = opts?.category;
      let website = opts?.website;
      setBrainState((b) => {
        name = name ?? b.name;
        category = category ?? b.category;
        website = website ?? b.website;
        return b;
      });

      try {
        const res = await fetch("/api/studio/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, category, website }),
          signal: controller.signal,
        });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          if (!live()) { try { await reader.cancel(); } catch { /* ignore */ } return; }
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let m: any;
            try { m = JSON.parse(line); } catch { continue; }
            if (!live()) return;
            if (m.type === "meta") {
              setResearch((r) => ({ ...r, details: { ...r.details, website: m.website || r.details.website, instagram: m.instagram || r.details.instagram, competitors: m.competitors?.length ? m.competitors : r.details.competitors } }));
            } else if (m.type === "detail" && m.key === "catalog") {
              setResearch((r) => ({ ...r, details: { ...r.details, productCount: m.productCount } }));
            } else if (m.type === "detail" && m.key === "images") {
              setResearch((r) => ({ ...r, details: { ...r.details, imageCount: m.imageCount, palette: m.palette?.length ? m.palette : r.details.palette } }));
            } else if (m.type === "products") {
              // Catalogue lands EARLY (the fast crawl), well before the full research `done`.
              // Store it now so the product library fills immediately; `done` fills the rest.
              const catalog = (m.catalog as StudioProduct[] | undefined) ?? [];
              if (catalog.length) {
                setBrainState((b) => ({
                  ...b,
                  catalog,
                  research: { ...(b.research ?? {}), productImages: m.productImages ?? b.research?.productImages, logo: m.logo ?? b.research?.logo, website: m.website ?? b.research?.website },
                }));
              }
            } else if (m.type === "done") {
              const fb = m.brain as BrandBrain;
              // MERGE — never replace: the user's questionnaire answers landed after research started.
              setBrainState((b) => ({ ...b, research: fb.research, intelligence: fb.intelligence, catalog: fb.catalog, ready: true }));
              setResearch((r) => ({ ...r, running: false, done: true }));
            } else if (m.type === "error") {
              setResearch((r) => ({ ...r, running: false, done: true, error: true }));
            }
          }
        }
        if (live()) setResearch((r) => (r.done ? r : { ...r, running: false, done: true }));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError" || !live()) return; // abandoned run — stay quiet
        setResearch((r) => ({ ...r, running: false, done: true, error: true }));
      }
    })();
  }, []);

  // Fire research the instant a real URL appears — pasted or freshly typed — so the brand kit
  // is already assembling before the user hits "Build". One run per host: the same site is a
  // no-op; a new site cancels the old run and re-arms clean.
  const speculateResearch = useCallback((rawWebsite: string) => {
    const website = (rawWebsite || "").trim();
    const key = normUrl(website);
    if (!key) return;                             // not a real domain yet — wait for more typing
    if (researchKeyRef.current === key) return;   // already researching (or done with) this exact site
    cancelResearch();                             // drop any previous site's in-flight run
    researchRan.current = false;                  // re-arm so startResearch actually runs
    researchKeyRef.current = key;
    const name = nameFromUrl(website);
    setResearch({ started: false, running: false, done: false, error: false, details: {} });
    // New site → clear the previous brand but keep user-level facts, then set identity + go.
    setBrainState((b) => ({ role: b.role, brandType: b.brandType, teamSize: b.teamSize, website, name, skippedResearch: false }));
    startResearch({ website, name });
  }, [cancelResearch, startResearch]);

  // Resume research after a mid-flow refresh: the provider remounts, but the pasted
  // site is still in the persisted brain — pick it back up so the live panel keeps filling.
  useEffect(() => {
    if (!hydrated) return;
    if (brain.website && !brain.ready && !brain.skippedResearch && !researchRan.current) {
      startResearch();
    }
  }, [hydrated, brain.website, brain.ready, brain.skippedResearch, startResearch]);

  const catalog = brain.catalog ?? [];
  const selectedIds = brain.selectedProductIds ?? [];

  const toggleProduct = useCallback((id: string) => {
    setBrainState((b) => {
      const cur = b.selectedProductIds ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...b, selectedProductIds: next };
    });
  }, []);
  const selectAll = useCallback(() => setBrainState((b) => ({ ...b, selectedProductIds: (b.catalog ?? []).map((p) => p.id) })), []);
  const clearSelection = useCallback(() => setBrainState((b) => ({ ...b, selectedProductIds: [] })), []);

  const selectedProducts = useMemo(
    () => catalog.filter((p) => selectedIds.includes(p.id)),
    [catalog, selectedIds]
  );

  const value: StudioCtx = {
    brain, hydrated, catalog, selectedIds, selectedProducts, research,
    setName, setCategory, setBrain, patch, resetForNewBrand, toggleProduct, selectAll, clearSelection, startResearch, speculateResearch,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudio must be used within <StudioProvider>");
  return c;
}

/**
 * Canonical host key for a pasted URL, so we research each site exactly once and can tell a
 * real domain from half-typed text: `www.brand.com/shop` → `brand.com`; `your`/`bran` → `""`.
 * Returning `""` doubles as "not a real URL yet", which gates the speculative research trigger.
 */
export function normUrl(url: string): string {
  const s = (url || "").trim().toLowerCase();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : "https://" + s);
    const host = u.hostname.replace(/^www\./, "");
    return host.includes(".") ? host : ""; // require a dot so "brand" alone doesn't trigger
  } catch {
    return "";
  }
}

/** Derive a clean brand name from a pasted URL: fynwellness.com → "Fynwellness". */
export function nameFromUrl(url: string): string {
  try {
    let u = url.trim();
    if (!/^https?:\/\//.test(u)) u = "https://" + u;
    const host = new URL(u).hostname.replace(/^www\./, "");
    const base = host.split(".")[0] || host;
    return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url.trim();
  }
}
