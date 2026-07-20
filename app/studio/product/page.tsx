"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, X, ImageIcon, Loader2, RefreshCw, ArrowUp, SlidersHorizontal, Images, Sparkles, Brain } from "lucide-react";
import { WorkBar } from "@/components/tastebud/WorkBar";
import { MealsPill, refreshMeals } from "@/components/tastebud/MealsPill";
import { mealsForImages, FREE_REDOS_PER_SHOT } from "@/lib/meals";
import { ShootStage } from "@/components/tastebud/ShootStage";
import { BrandBrainPanel } from "@/components/tastebud/BrandBrainPanel";
import { ProductLibraryPanel } from "@/components/tastebud/ProductLibraryPanel";
import type { BrandBrain, ShotCompliance, StudioProduct } from "@/lib/types";

/**
 * PAGE 8 — Studio workspace (Product mode).
 * Panel (fine-tune) · Canvas (the star) · always-on chat. The brand brain from
 * Page 6 governs everything; refine actions live on each shot card.
 */

type Product = { name: string; url: string };
type Decision = "keep" | "reject" | "hero";
type Shot = { id: string; angle: string; prompt: string; url: string; negatives?: string[]; compliance?: ShotCompliance; aspect?: number; pending?: boolean; failed?: boolean; hires?: boolean; decision?: Decision; drift?: boolean; driftReasons?: string[]; brandGeneric?: boolean; redos?: number };
type Msg = { role: "user" | "assistant"; content: string };
type Panel = { background: string; surface: string; vibe: string; composition: string; lighting: string; styling: string; format: string; numAngles: number; shotsPerAngle: number };
type Brief = Partial<Panel> & { express?: string };

// Start the first shoot at ONE image — a single hero the founder reacts to. They can
// ask for more (or bump the panel) afterwards; an explicit count overrides this default.
const EMPTY_PANEL: Panel = { background: "", surface: "", vibe: "", composition: "", lighting: "", styling: "", format: "", numAngles: 1, shotsPerAngle: 1 };

const aspectNum = (a?: string | number): number => {
  if (typeof a === "number") return a;
  if (typeof a === "string" && a.includes(":")) { const [w, h] = a.split(":").map(Number); return w / h; }
  return 4 / 5;
};

// Grid cells only need a small image — request a resized WebP thumbnail for served
// shots (≈20× lighter); leave data-URL / external sources untouched.
const displaySrc = (url: string, w = 900): string =>
  url.startsWith("/api/img/") ? `${url}${url.includes("?") ? "&" : "?"}w=${w}` : url;

// Client-side mirror of brainStore.slugify — derives the brand's folder slug from its name.
const slugify = (name: string): string =>
  (name || "brand").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brand";

const OPTIONS: Record<"background" | "surface" | "vibe" | "composition" | "lighting" | "styling" | "format", string[]> = {
  background: ["Pure white", "Pure black", "Art-directed", "Match the product", "Soft cream", "Warm beige", "Sand / tan", "Blush pink", "Dusty rose", "Terracotta", "Coral / orange", "Mustard yellow", "Cherry red", "Sage green", "Olive green", "Deep forest green", "Mint", "Sky blue", "Teal", "Deep navy", "Electric blue", "Lavender", "Royal purple", "Plum", "Stone grey", "Charcoal grey", "Chocolate brown", "Soft gradient glow"],
  surface: ["Marble", "Stone", "Concrete", "Polished wood", "Raw wood", "Linen / fabric", "Wet / water", "Sand", "Glass / acrylic", "Ceramic", "Brushed metal", "Paper", "Pebbles / gravel", "Ice"],
  vibe: ["Premium / minimal", "Luxury / quiet", "Bold & vibrant", "Playful & fun", "Editorial", "Clean & clinical", "Natural / organic", "Warm & cozy", "Moody / cinematic", "Fresh & energetic", "Retro / vintage", "Futuristic / tech", "Streetwear / cool", "Sensual / tactile"],
  composition: ["Centered hero", "Rule of thirds", "Generous negative space", "Tight crop", "Overhead flat-lay", "Floating / levitation", "Grouped still life", "Symmetrical", "Diagonal / dynamic", "Single subject, minimal", "Layered depth"],
  lighting: ["Soft daylight", "Bright & airy (high-key)", "Moody / low-key", "Golden hour", "Hard sunlight & shadow", "Studio softbox", "Dramatic single-source", "Backlit / rim light", "Neon / coloured gels", "Gradient glow", "Natural window light", "Direct flash"],
  styling: ["Minimal / clean", "A few props", "Maximal — prop-rich", "Ingredient scatter", "Bold colour-block"],
  format: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"],
};

export default function ProductWorkspace() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrandBrain>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [references, setReferences] = useState<Product[]>([]);
  const [panel, setPanel] = useState<Panel>(EMPTY_PANEL);
  const [showPanel, setShowPanel] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc.activeBrand");
      if (raw) {
        const b = JSON.parse(raw) as BrandBrain;
        if (b?.name) {
          setBrain(b);
          // Seed the shoot with the products the founder selected in the library — no re-upload.
          const chosen = (b.catalog ?? [])
            .filter((p) => (b.selectedProductIds ?? []).includes(p.id))
            .map((p) => ({ name: p.name, url: p.images[0] }))
            .filter((p) => p.url);
          if (chosen.length) setProducts(chosen);
          const opener = chosen.length
            ? `Shooting for ${b.name}. I've loaded ${chosen.length} product${chosen.length > 1 ? "s" : ""} from your library — tell me the vibe, or just hit send and I'll shoot on-brand.`
            : `Shooting for ${b.name}. Upload your product and tell me what you want — or just hit send and I’ll shoot it on-brand.`;
          setMessages([{ role: "assistant", content: opener }]);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    router.replace("/studio");
  }, [router]);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, thinking]);
  useEffect(() => { fetch("/api/enhance").then((r) => r.json()).then((j) => setEnhanceOn(!!j.enabled)).catch(() => {}); }, []);

  const say = (role: Msg["role"], content: string) => setMessages((m) => [...m, { role, content }]);

  // Open-source enhancers (Replicate). Cutout appends a NEW card so the original stays.
  async function enhance(shot: Shot, action: "cutout" | "relight", prompt?: string) {
    setBusy(true); setStatus(action === "cutout" ? "Cutting out…" : "Relighting…");
    try {
      const r = await fetch("/api/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, src: shot.url, prompt, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name }) });
      const j = await r.json();
      if (j.url) {
        const tag = action === "cutout" ? "cutout" : "relit";
        setShots((cur) => [...cur, { id: `${shot.id}-${tag}-${Math.random().toString(36).slice(2, 6)}`, angle: `${shot.angle} · ${tag}`, prompt: "", url: j.url, aspect: shot.aspect }]);
      } else { say("assistant", j.error || `${action} failed.`); }
    } catch (e) { say("assistant", `${action} hit an error: ${(e as Error).message}`); }
    setBusy(false); setStatus("");
  }

  function addFiles(files: FileList | null, set: React.Dispatch<React.SetStateAction<Product[]>>) {
    for (const f of Array.from(files ?? [])) {
      if (!f.type.startsWith("image/")) continue;
      const rd = new FileReader();
      rd.onload = () => set((p) => [...p, { name: f.name, url: String(rd.result) }]);
      rd.readAsDataURL(f);
    }
  }

  async function createTurn(text: string) {
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next); setThinking(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, state: { productCount: products.length, brandStatus: "have" }, brand: brain }) });
      const j = await r.json();
      if (j.reply) say("assistant", j.reply);
      for (const a of j.actions ?? []) {
        if (a.type === "show_panel") setShowPanel(true);
        else if (a.type === "generate_shoot") await generate(a.brief ?? {});
      }
    } catch { say("assistant", "I hit a snag — try that again?"); }
    setThinking(false);
  }

  function send() {
    if (thinking || busy) return;
    const text = input.trim();
    if (!text) {
      say("assistant", !products.length ? "Shooting an on-brand scene (no product loaded)." : references.length ? "Generating — matching your reference." : "Generating your shoot."); generate({}); return;
    }
    setInput(""); createTurn(text);
  }

  async function stream(body: object, h: { onPlan: (s: { id: string; angle: string }[], a?: string) => void; onShot: (s: Shot) => void; onError: (id?: string) => void; onReshoot: (id: string) => void }) {
    const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.type === "plan") h.onPlan(m.shots ?? [], m.aspect);
        else if (m.type === "qc") h.onReshoot(m.id);
        else if (m.type === "shot") h.onShot(m.shot);
        else if (m.type === "shotError") h.onError(m.id);
        else if (m.type === "meals") {
          if (m.event === "clamped") say("assistant", m.granted > 0
            ? `You have ${m.balance} Meal${m.balance === 1 ? "" : "s"} left, so I'm shooting ${m.granted} of the ${m.wanted} images. Top up on the pricing page to shoot the rest.`
            : `You're out of Meals — top up on the pricing page to keep creating.`);
          refreshMeals();
        }
      }
    }
  }

  // Reconstruct the FULL selected products (every image + their facts) from the brand catalog so
  // the backend can lock product identity, hand the model front+back panels, and enrich the
  // on-pack manifest. Falls back to a minimal record for ad-hoc uploads (no catalog match).
  function productInfoFor(urls: string[]): StudioProduct[] {
    const cat = brain.catalog ?? [];
    return urls.filter(Boolean).map((url) => {
      const match = cat.find((c) => c.images?.includes(url) || c.images?.[0] === url);
      return match ?? { id: url, name: "", images: [url] };
    });
  }

  async function generate(brief: Brief) {
    // No product? Per the readiness rule we still shoot — an on-brand, brand-generic scene with
    // NO invented hero product (the backend flags it). Product shots need a real product image.
    if (!products.length) say("assistant", "No product loaded — I’ll shoot an on-brand scene. Upload your product anytime for true product shots.");
    const merged: Panel = { ...panel };
    (["background", "surface", "vibe", "lighting", "composition", "styling", "format"] as const).forEach((k) => { if (!merged[k] && brief[k]) (merged[k] as string) = brief[k] as string; });
    // Honour an explicit count from the agent/user ("6 angles", "3 shots"); otherwise the
    // default stays a single hero image for the first shoot.
    if (typeof brief.numAngles === "number") merged.numAngles = brief.numAngles;
    if (typeof brief.shotsPerAngle === "number") merged.shotsPerAngle = brief.shotsPerAngle;
    setBusy(true); setShots([]); setStatus("Art-directing the shoot…");
    try {
      await stream(
        { mode: "product-photoshoot", express: brief.express ?? "", panel: merged, products: products.map((p) => p.url), productInfo: productInfoFor(products.map((p) => p.url)), references: references.map((r) => r.url), brand: brain },
        {
          onPlan: (stubs, aspect) => { setStatus(`Shooting ${stubs.length} image${stubs.length > 1 ? "s" : ""}…`); setShots(stubs.map((st) => ({ id: st.id, angle: st.angle, prompt: "", url: "", aspect: aspectNum(aspect), pending: true }))); },
          onReshoot: (id) => setShots((cur) => cur.map((x) => (x.id === id ? { ...x, pending: true } : x))),
          onShot: (s) => setShots((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...s, aspect: aspectNum(s.aspect), pending: false, failed: false } : x))),
          onError: (id) => id && setShots((cur) => cur.map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x))),
        }
      );
    } catch (e) { say("assistant", `Generation hit an error: ${(e as Error).message}`); }
    setBusy(false); setStatus(""); refreshMeals();
  }

  async function single(opts: { express: string; products: string[]; redo?: boolean }): Promise<Shot | null> {
    let out: Shot | null = null;
    await stream(
      // A satisfaction redo/refine of one already-paid shot doesn't spend a Meal — the server honours `redo` (see lib/meals).
      { mode: "product-photoshoot", express: opts.express, panel: { numAngles: 1, shotsPerAngle: 1, format: panel.format }, products: opts.products, productInfo: productInfoFor(opts.products), references: references.map((r) => r.url), brand: brain, ...(opts.redo ? { redo: true } : {}) },
      { onPlan: () => {}, onReshoot: () => {}, onError: () => {}, onShot: (s) => { if (!out) out = { ...s, aspect: aspectNum(s.aspect) }; } }
    );
    return out;
  }

  // Blind one-click redo — free while the shot is inside its redo allowance; the card swaps to a
  // directed chat refine once the allowance is spent, so this only ever fires on a free redo.
  async function reshoot(shot: Shot) {
    const used = shot.redos ?? 0;
    setBusy(true); setStatus("Re-shooting…");
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true, failed: false } : s)));
    const r = await single({ express: shot.angle, products: products.map((p) => p.url), redo: used < FREE_REDOS_PER_SHOT });
    setShots((cur) => cur.map((s) => (s.id === shot.id ? (r ? { ...s, url: r.url, aspect: r.aspect, pending: false, failed: false, redos: used + 1 } : { ...s, pending: false, failed: true, redos: used + 1 }) : s)));
    setBusy(false); setStatus("");
  }

  async function applyChange(shot: Shot, text: string) {
    if (!text.trim()) return;
    setEditing(null); setBusy(true); setStatus("Changing…");
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true } : s)));
    // With Replicate on, route through FLUX Kontext (true instruction edit — preserves the product). Else re-render.
    if (enhanceOn) {
      try {
        // Re-inject the shot's stored compliance so the edit can't drift off-brand; the route
        // also runs a post-edit product-fidelity re-check and returns a drift flag.
        // A directed refine fixes a shot you already paid for — free (redo).
        const r = await fetch("/api/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "edit", src: shot.url, prompt: text, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name, redo: true }) });
        const j = await r.json();
        setShots((cur) => cur.map((s) => (s.id === shot.id ? (j.url ? { ...s, url: j.url, hires: false, pending: false, drift: !!j.drift, driftReasons: j.driftReasons ?? [] } : { ...s, pending: false }) : s)));
      } catch { setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: false } : s))); }
      setBusy(false); setStatus(""); return;
    }
    const r = await single({ express: text, products: [shot.url], redo: true });
    setShots((cur) => cur.map((s) => (s.id === shot.id ? (r ? { ...s, url: r.url, pending: false } : { ...s, pending: false }) : s)));
    setBusy(false); setStatus("");
  }

  // The brand-memory loop: mark a shot Keep / Hero / Reject → persist the winning (or
  // rejected) art-direction into the brand brain so the NEXT brief leans on it. Optimistic;
  // patches the in-memory brain + localStorage so the same session's next shoot sees it.
  async function decide(shot: Shot, decision: Decision) {
    if (!brain.name || !shot.url || shot.pending) return;
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, decision } : s)));
    try {
      const r = await fetch(`/api/brains/${slugify(brain.name)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: {
            id: shot.id, url: shot.url, angle: shot.angle, prompt: shot.prompt,
            negatives: shot.negatives, panel, mode: "product-photoshoot", decision,
            at: new Date().toISOString(),
          },
        }),
      });
      const j = await r.json();
      if (j.memory) {
        const next = { ...brain, memory: j.memory };
        setBrain(next);
        try { localStorage.setItem("cc.activeBrand", JSON.stringify(next)); } catch { /* ignore */ }
      }
    } catch { /* optimistic UI already applied */ }
  }

  async function upscale(shot: Shot) {
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true } : s)));
    try {
      const r = await fetch("/api/upscale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: shot.url, aspect: shot.aspect }) });
      const j = await r.json();
      if (r.status === 402) say("assistant", j.error || "Out of Meals — top up on the pricing page.");
      setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, url: j.url || s.url, hires: Boolean(j.url), pending: false } : s)));
    } catch {
      setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: false } : s)));
    }
    refreshMeals();
  }

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <WorkBar
        brand={brain.name}
        right={
          <div className="flex items-center gap-3">
            <MealsPill />
            <button onClick={() => setShowLibrary(true)} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Your product library">
              <Images size={13} /> Library
            </button>
            <button onClick={() => setShowBrain(true)} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Everything we know about this brand">
              <Brain size={13} /> Brand brain
            </button>
            <span className="text-[12px] text-muted">Product</span>
          </div>
        }
      />
      <BrandBrainPanel brain={brain} open={showBrain} onClose={() => setShowBrain(false)} />
      <ProductLibraryPanel
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        brandName={brain.name}
        catalog={brain.catalog ?? []}
        products={products}
        onAdd={(p) => setProducts((cur) => (cur.some((x) => x.url === p.url) ? cur : [...cur, p]))}
        onRemove={(url) => setProducts((cur) => cur.filter((x) => x.url !== url))}
        onUpload={(files) => addFiles(files, setProducts)}
      />
      <div className={`grid min-h-0 flex-1 overflow-hidden ${showPanel ? "grid-cols-[360px_300px_minmax(0,1fr)]" : "grid-cols-[360px_minmax(0,1fr)]"}`}>
        {/* Panel — hidden by default; surfaces only when the user wants to fine-tune a result */}
        {showPanel && (
        <div className="order-2 min-h-0 overflow-y-auto border-r border-hairline px-5 py-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted">Fine-tune</span>
            <button onClick={() => setShowPanel(false)} className="text-muted transition-colors hover:text-ink" title="Close fine-tune"><X size={14} /></button>
          </div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">Leave anything blank and I’ll choose it on-brand. The canvas is the star — talk to me to refine.</p>
          <div className="grid grid-cols-1 gap-3">
              {(["background", "vibe", "lighting", "composition", "surface", "styling", "format"] as const).map((k) => (
                <Sel key={k} label={k} value={panel[k]} opts={OPTIONS[k]} onChange={(v) => setPanel({ ...panel, [k]: v })} />
              ))}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Angles</span><span className="text-[10px] normal-case text-muted/70">how many angles</span>
                  <input type="number" min={1} max={6} value={panel.numAngles} onChange={(e) => setPanel({ ...panel, numAngles: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Shots</span><span className="text-[10px] normal-case text-muted/70">pictures per angle</span>
                  <input type="number" min={1} max={6} value={panel.shotsPerAngle} onChange={(e) => setPanel({ ...panel, shotsPerAngle: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
              </div>
              <button onClick={() => generate({ express: input.trim() })} disabled={busy} className="mt-1 rounded-control bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40">{busy ? "Shooting…" : `Generate ${panel.numAngles * panel.shotsPerAngle} image${panel.numAngles * panel.shotsPerAngle > 1 ? "s" : ""} · ${mealsForImages(Math.min(6, panel.numAngles * panel.shotsPerAngle))} Meal${mealsForImages(Math.min(6, panel.numAngles * panel.shotsPerAngle)) === 1 ? "" : "s"}`}</button>
          </div>
        </div>
        )}

        {/* Canvas */}
        <div className="order-3 min-h-0 overflow-y-auto bg-surface px-7 py-7">
          {shots.length === 0 ? (
            busy ? (
              <ShootStage status={status} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted">
                <div className="flex h-40 w-40 items-center justify-center rounded-card border border-hairline"><ImageIcon size={26} strokeWidth={1.5} /></div>
                <p className="mt-4 text-sm">Your shoots will appear here.</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
              {shots.map((s) => (
                <motion.div key={s.id} initial={{ opacity: 0, scale: 0.985, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="group overflow-hidden rounded-card bg-canvas transition-shadow duration-200 ease-brand hover:shadow-card">
                  <div className="relative w-full overflow-hidden bg-surface" style={{ aspectRatio: String(s.aspect ?? 4 / 5) }}>
                    {s.url ? (
                      <>
                        <img src={displaySrc(s.url)} alt={s.angle} loading="lazy" decoding="async" className={`h-full w-full object-cover transition-opacity duration-200 ${s.pending ? "opacity-40" : s.decision === "reject" ? "opacity-45" : ""}`} />
                        {s.pending && <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink" /></div>}
                        {s.hires && !s.pending && <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] text-canvas">4K</span>}
                        {s.decision === "hero" && !s.pending && <span className="absolute right-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[10px] text-canvas">Hero</span>}
                        {s.decision === "keep" && !s.pending && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ink" title="Kept" />}
                        {s.decision === "reject" && !s.pending && <span className="absolute left-2 bottom-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-canvas">rejected</span>}
                        {s.drift && !s.pending && <span title={(s.driftReasons ?? []).join("; ") || "This edit may have drifted off-brand"} className="absolute right-2 bottom-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-canvas">check brand</span>}
                      </>
                    ) : s.failed ? (
                      <button onClick={() => reshoot(s)} className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted transition-colors hover:text-ink"><RefreshCw size={18} /><span className="text-xs">failed · retry</span></button>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted"><Loader2 size={20} className="animate-spin" /></div>
                    )}
                  </div>
                  <div className="px-3 pb-3 pt-2.5">
                    {s.url && !s.pending && (
                      <div className="flex flex-wrap items-center gap-2.5 text-[12px]">
                        <button onClick={() => decide(s, "keep")} className={s.decision === "keep" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Keep — teach the brand this worked">Keep</button>
                        <button onClick={() => decide(s, "hero")} className={s.decision === "hero" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Hero — the standout of the set">Hero</button>
                        <button onClick={() => decide(s, "reject")} className={s.decision === "reject" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Reject — steer future shoots away from this">Reject</button>
                        <span className="h-3 w-px bg-hairline" />
                        {(s.redos ?? 0) < FREE_REDOS_PER_SHOT ? (
                          <>
                            <button onClick={() => setEditing({ id: s.id, text: "" })} className="text-muted transition-colors hover:text-ink" title="Tell me what to change — free">Change</button>
                            <button onClick={() => reshoot(s)} className="text-muted transition-colors hover:text-ink" title={`Re-roll this shot — ${FREE_REDOS_PER_SHOT - (s.redos ?? 0)} free redo${FREE_REDOS_PER_SHOT - (s.redos ?? 0) === 1 ? "" : "s"} left`}>Redo</button>
                          </>
                        ) : (
                          <button onClick={() => setEditing({ id: s.id, text: "" })} className="text-muted transition-colors hover:text-ink" title="Free redos used — tell me exactly what to change and I'll get it right, free">Refine in chat</button>
                        )}
                        <button onClick={() => upscale(s)} className="flex items-center gap-1 text-muted transition-colors hover:text-ink"><Sparkles size={12} />4K</button>
                        {enhanceOn && <button onClick={() => enhance(s, "cutout")} className="text-muted transition-colors hover:text-ink">Cutout</button>}
                        {enhanceOn && <button onClick={() => enhance(s, "relight")} className="text-muted transition-colors hover:text-ink">Relight</button>}
                        <a href={s.url} download={`${s.angle || "shot"}.png`} className="ml-auto text-muted transition-colors hover:text-ink">Save</a>
                      </div>
                    )}
                    {editing?.id === s.id && (
                      <div className="mt-2 flex gap-2">
                        <input autoFocus value={editing.text} onChange={(e) => setEditing({ id: s.id, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyChange(s, editing!.text)} placeholder="What to change — e.g. warmer light, on marble" className="flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" />
                        <button onClick={() => applyChange(s, editing!.text)} className="rounded-md bg-ink px-3 py-1.5 text-xs text-canvas">Apply</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Chat — left side */}
        <div className="order-1 flex min-h-0 flex-col border-r border-hairline">
          <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-6" style={{ minHeight: 0 }}>
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[88%] rounded-card bg-ink px-3.5 py-2 text-[14px] leading-relaxed text-canvas" : "max-w-[92%] text-[14px] leading-relaxed text-ink"}>{m.content}</div>
              </motion.div>
            ))}
            {thinking && <div className="flex items-center gap-2 text-muted"><Loader2 size={15} className="animate-spin" /><span className="text-sm">{status || "Thinking…"}</span></div>}
            {!thinking && status && <div className="text-sm text-muted">{status}</div>}
          </div>

          {references.length > 0 && (
            <div className="px-5 pb-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">References — match this look</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => refFileRef.current?.click()} className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-hairline text-muted hover:border-ink hover:text-ink"><Images size={14} /></button>
                {references.map((p, i) => (
                  <div key={i} className="group relative h-11 w-11 overflow-hidden rounded-md border border-ink/30">
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => setReferences((cur) => cur.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block"><X size={10} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Products live in the Library panel, not the chat — keep the conversation clean. */}
          {products.length > 0 && (
            <div className="px-5 pb-2 text-[12px] text-muted">
              {products.length} product{products.length > 1 ? "s" : ""} in this shoot ·{" "}
              <button onClick={() => setShowLibrary(true)} className="text-ink underline-offset-2 transition-opacity hover:opacity-70">Open library</button>
            </div>
          )}

          <div className="border-t border-hairline px-5 py-4">
            <div className="flex items-end gap-2 rounded-card border border-hairline px-3 py-2 focus-within:border-ink">
              <button onClick={() => fileRef.current?.click()} title="Add product photo" className="rounded-md p-1.5 text-muted hover:text-ink"><Upload size={18} /></button>
              <button onClick={() => refFileRef.current?.click()} title="Add style reference" className="rounded-md p-1.5 text-muted hover:text-ink"><Images size={18} /></button>
              <button onClick={() => setShowPanel((s) => !s)} title="Fine-tune panel" className={`rounded-md p-1.5 hover:text-ink ${showPanel ? "text-ink" : "text-muted"}`}><SlidersHorizontal size={18} /></button>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder="Message your creative director…"
                className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none" />
              <button onClick={send} disabled={thinking || busy || (!input.trim() && !products.length)} title={!input.trim() && products.length ? "Generate" : "Send"} className="rounded-full bg-ink p-1.5 text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"><ArrowUp size={16} /></button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files, setProducts)} />
            <input ref={refFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files, setReferences)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sel({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink">
        <option value="">— from brand —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
