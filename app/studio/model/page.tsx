"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, X, ImageIcon, Loader2, RefreshCw, ArrowUp, SlidersHorizontal, UserPlus, ScanFace, Sparkles, Brain } from "lucide-react";
import { WorkBar } from "@/components/tastebud/WorkBar";
import { ShootStage } from "@/components/tastebud/ShootStage";
import { BrandBrainPanel } from "@/components/tastebud/BrandBrainPanel";
import { thumb } from "@/lib/thumb";
import type { ModelSpec, BrandBrain, ShotCompliance } from "@/lib/types";
import { detectCategory, interactionOptions } from "@/lib/productCategory";

/**
 * PAGE 8 — Studio workspace (Model mode).
 * Build a model (hair, makeup, body, age, energy) or paste a reference person to
 * reproduce; add the product (worn/held/applied); generate with identity held across
 * the set. Same brain, same canvas-first workspace as Product mode.
 */

type Img = { name: string; url: string };
type Decision = "keep" | "reject" | "hero";
type Shot = { id: string; angle: string; prompt: string; url: string; negatives?: string[]; compliance?: ShotCompliance; aspect?: number; pending?: boolean; failed?: boolean; hires?: boolean; decision?: Decision; drift?: boolean; driftReasons?: string[] };
type Msg = { role: "user" | "assistant"; content: string };
type Scene = { background: string; vibe: string; lighting: string; composition: string; format: string; numAngles: number; shotsPerAngle: number };
type Source = "build" | "reference";

// First shoot = one image; an explicit count (panel or agent) overrides this.
const EMPTY_SCENE: Scene = { background: "", vibe: "", lighting: "", composition: "", format: "", numAngles: 1, shotsPerAngle: 1 };
const EMPTY_MODEL: ModelSpec = { source: "build", productUse: "" };

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

const MODEL_OPTIONS: Record<"gender" | "ageRange" | "ethnicity" | "skinTone" | "hairColor" | "hairStyle" | "eyes" | "bodyType" | "vibe" | "expression", string[]> = {
  gender: ["Woman", "Man", "Non-binary", "Androgynous"],
  ageRange: ["Teens / early 20s", "20s", "30s", "40s", "50s", "60+"],
  ethnicity: ["South Asian", "East Asian", "Southeast Asian", "Black / African", "Latina/o", "White / European", "Middle Eastern", "Mixed"],
  skinTone: ["Fair", "Light", "Medium", "Olive", "Tan", "Deep", "Dark"],
  hairColor: ["Black", "Dark brown", "Brown", "Auburn", "Blonde", "Platinum", "Red", "Grey / silver"],
  hairStyle: ["Short / cropped", "Buzzed", "Shoulder-length", "Long", "Wavy", "Curly", "Coily / natural", "Straight", "Tied back / bun"],
  eyes: ["Brown", "Dark brown", "Hazel", "Green", "Blue", "Grey"],
  bodyType: ["Slim", "Athletic", "Average", "Curvy", "Plus", "Tall", "Petite"],
  vibe: ["Editorial / high-fashion", "Next door / relatable", "Luxury / refined", "Sporty / active", "Streetwear / cool", "Natural / minimal", "Warm / approachable", "Bold / striking"],
  expression: ["Serene / neutral", "Soft smile", "Confident", "Candid laugh", "Intense / editorial", "Joyful"],
};
// "How it's used" options are derived per product category (see productCategory.ts) so a
// sofa never offers "Worn" and an ice cream offers Eat / Show — never wear-the-food nonsense.

const SCENE_OPTIONS: Record<"background" | "vibe" | "lighting" | "composition" | "format", string[]> = {
  background: ["Pure white", "Pure black", "Art-directed", "Soft cream", "Warm beige", "Sand / tan", "Studio backdrop", "Outdoor / natural", "Urban / street", "Interior / home", "Sage green", "Deep navy", "Terracotta", "Soft gradient glow"],
  vibe: ["Premium / minimal", "Luxury / quiet", "Editorial", "Bold & vibrant", "Natural / organic", "Warm & cozy", "Moody / cinematic", "Fresh & energetic", "Streetwear / cool", "Sensual / tactile"],
  lighting: ["Soft daylight", "Bright & airy (high-key)", "Moody / low-key", "Golden hour", "Hard sunlight & shadow", "Studio softbox", "Dramatic single-source", "Backlit / rim light", "Natural window light"],
  composition: ["Centered hero", "Rule of thirds", "Generous negative space", "Tight crop", "Single subject, minimal", "Layered depth"],
  format: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"],
};

const OPENING = "Let’s shoot your model. Build one on the left — skin, hair, makeup, body, the energy you want — or paste a photo of the exact person you have in mind and I’ll reproduce them faithfully. Then just say go.";

export default function ModelWorkspace() {
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [brain, setBrain] = useState<BrandBrain>({});
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: OPENING }]);
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Source>("build");
  const [model, setModel] = useState<ModelSpec>(EMPTY_MODEL);
  const [modelRefs, setModelRefs] = useState<Img[]>([]);
  const [group, setGroup] = useState(false); // treat each reference photo as a DIFFERENT person (3–4 in one frame)
  const [products, setProducts] = useState<Img[]>([]);
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE);
  const [showScene, setShowScene] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const refFileRef = useRef<HTMLInputElement>(null);
  const prodFileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc.activeBrand");
      if (raw) {
        const b = JSON.parse(raw) as BrandBrain;
        if (b?.name) {
          setBrain(b); setBrandName(b.name);
          // Seed the on-model product from the library selection (first chosen product) — no re-upload.
          const chosen = (b.catalog ?? [])
            .filter((p) => (b.selectedProductIds ?? []).includes(p.id))
            .map((p) => ({ name: p.name, url: p.images[0] }))
            .filter((p) => p.url);
          if (chosen.length) setProducts(chosen);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    router.replace("/studio");
  }, [router]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, thinking]);
  // Light up the open-source enhancers (cutout / relight / Kontext edit) only when Replicate is configured.
  useEffect(() => { fetch("/api/enhance").then((r) => r.json()).then((j) => setEnhanceOn(!!j.enabled)).catch(() => {}); }, []);

  const say = (role: Msg["role"], content: string) => setMessages((m) => [...m, { role, content }]);
  const setM = (patch: Partial<ModelSpec>) => setModel((m) => ({ ...m, ...patch }));

  function addImgs(files: FileList | null, set: React.Dispatch<React.SetStateAction<Img[]>>) {
    for (const f of Array.from(files ?? [])) {
      if (!f.type.startsWith("image/")) continue;
      const rd = new FileReader();
      rd.onload = () => set((p) => [...p, { name: f.name, url: String(rd.result) }]);
      rd.readAsDataURL(f);
    }
  }

  async function chatTurn(text: string) {
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next); setThinking(true);
    try {
      const state = { modelReady: source === "build" || modelRefs.length > 0, modelSource: source, hasReference: modelRefs.length > 0, productCount: products.length };
      const r = await fetch("/api/model-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, state, brand: brain.name ? brain : undefined }) });
      const j = await r.json();
      if (j.reply) say("assistant", j.reply);
      for (const a of j.actions ?? []) {
        if (a.type === "set_model_source") setSource(a.source === "reference" ? "reference" : "build");
        else if (a.type === "patch_model") setM(a.spec ?? {});
        else if (a.type === "request_reference_upload") { setSource("reference"); refFileRef.current?.click(); }
        else if (a.type === "request_product_upload") prodFileRef.current?.click();
        else if (a.type === "show_scene") setShowScene(true);
        else if (a.type === "generate_model_shoot") await generate(a.brief ?? {});
      }
    } catch { say("assistant", "I hit a snag — try that again?"); }
    setThinking(false);
  }

  function send() {
    if (thinking || busy) return;
    const text = input.trim();
    if (!text) { startShoot(); return; }
    setInput(""); chatTurn(text);
  }

  function startShoot() {
    if (source === "reference" && !modelRefs.length) { say("assistant", "Paste a photo of your model first and I’ll reproduce that exact person."); setSource("reference"); refFileRef.current?.click(); return; }
    say("assistant", source === "reference" ? "Shooting — staying faithful to your model." : "Shooting your model now.");
    generate({});
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
        else if (m.type === "error") { say("assistant", `Generation error: ${m.error}`); }
      }
    }
  }

  function modelBody(extra: { express?: string; scene?: Partial<Scene> }) {
    const sc: Scene = { ...scene, ...(extra.scene ?? {}) };
    return {
      mode: "model-photoshoot",
      express: extra.express ?? "",
      panel: { background: sc.background, vibe: sc.vibe, lighting: sc.lighting, composition: sc.composition, format: sc.format, numAngles: sc.numAngles, shotsPerAngle: sc.shotsPerAngle },
      products: products.map((p) => p.url),
      modelRefs: source === "reference" ? modelRefs.map((r) => r.url) : [],
      // Group shoot: each reference photo is a DISTINCT person (cap 4) → the renderer builds a
      // per-person identity lock. Off / <2 photos → single-model path, unchanged.
      models: group && source === "reference" && modelRefs.length >= 2
        ? modelRefs.slice(0, 4).map((r, i) => ({ source: "reference" as const, name: `Person ${i + 1}`, refs: [r.url] }))
        : undefined,
      model: { ...model, source },
      brand: brain.name ? brain : undefined,
    };
  }

  async function generate(brief: { express?: string; background?: string; vibe?: string; lighting?: string; composition?: string; format?: string; productUse?: string; numAngles?: number; shotsPerAngle?: number }) {
    if (source === "reference" && !modelRefs.length) { say("assistant", "I’ll need your model’s photo first — paste it on the left."); setSource("reference"); return; }
    const merged: Scene = { ...scene };
    (["background", "vibe", "lighting", "composition", "format"] as const).forEach((k) => { if (!merged[k] && brief[k]) (merged[k] as string) = brief[k] as string; });
    if (brief.numAngles) merged.numAngles = brief.numAngles;
    if (brief.shotsPerAngle) merged.shotsPerAngle = brief.shotsPerAngle;
    if (brief.productUse && !model.productUse) setM({ productUse: brief.productUse });
    const modelSpec = { ...model, source, productUse: model.productUse || brief.productUse || "" };

    setBusy(true); setShots([]); setStatus("Casting and art-directing…");
    try {
      await stream(
        { ...modelBody({ express: brief.express, scene: merged }), model: modelSpec },
        {
          onPlan: (stubs, aspect) => { setStatus(`Shooting ${stubs.length} frame${stubs.length > 1 ? "s" : ""}…`); setShots(stubs.map((st) => ({ id: st.id, angle: st.angle, prompt: "", url: "", aspect: aspectNum(aspect), pending: true }))); },
          onReshoot: (id) => setShots((cur) => cur.map((x) => (x.id === id ? { ...x, pending: true } : x))),
          onShot: (s) => setShots((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...s, aspect: aspectNum(s.aspect), pending: false, failed: false } : x))),
          onError: (id) => id && setShots((cur) => cur.map((x) => (x.id === id ? { ...x, pending: false, failed: true } : x))),
        }
      );
    } catch (e) { say("assistant", `Generation hit an error: ${(e as Error).message}`); }
    setBusy(false); setStatus("");
  }

  async function single(express: string): Promise<Shot | null> {
    let out: Shot | null = null;
    await stream(
      { ...modelBody({ express, scene: { numAngles: 1, shotsPerAngle: 1 } }), model: { ...model, source } },
      { onPlan: () => {}, onReshoot: () => {}, onError: () => {}, onShot: (s) => { if (!out) out = { ...s, aspect: aspectNum(s.aspect) }; } }
    );
    return out;
  }

  async function reshoot(shot: Shot) {
    setBusy(true); setStatus("Re-shooting…");
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true, failed: false } : s)));
    const r = await single(shot.angle);
    setShots((cur) => cur.map((s) => (s.id === shot.id ? (r ? { ...s, url: r.url, aspect: r.aspect, pending: false, failed: false } : { ...s, pending: false, failed: true }) : s)));
    setBusy(false); setStatus("");
  }

  async function applyChange(shot: Shot, text: string) {
    if (!text.trim()) return;
    setEditing(null); setBusy(true); setStatus("Changing…");
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true } : s)));
    // With Replicate on, route through FLUX Kontext — a true instruction edit that changes
    // only what's asked and keeps the rest faithful. Otherwise fall back to a re-render.
    if (enhanceOn) {
      try {
        // Re-inject the shot's stored compliance (product + model identity lock) so the edit stays on-brand.
        const r = await fetch("/api/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "edit", src: shot.url, prompt: text, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name }) });
        const j = await r.json();
        setShots((cur) => cur.map((s) => (s.id === shot.id ? (j.url ? { ...s, url: j.url, hires: false, pending: false, drift: !!j.drift, driftReasons: j.driftReasons ?? [] } : { ...s, pending: false }) : s)));
      } catch { setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: false } : s))); }
      setBusy(false); setStatus(""); return;
    }
    const r = await single(`${shot.angle}. ${text}`);
    setShots((cur) => cur.map((s) => (s.id === shot.id ? (r ? { ...s, url: r.url, pending: false } : { ...s, pending: false }) : s)));
    setBusy(false); setStatus("");
  }

  // Open-source enhancers (Replicate). Cutout/relight append a NEW card so the original is kept.
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

  async function upscale(shot: Shot) {
    setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: true } : s)));
    try {
      const r = await fetch("/api/upscale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: shot.url, aspect: shot.aspect }) });
      const j = await r.json();
      setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, url: j.url || s.url, hires: Boolean(j.url), pending: false } : s)));
    } catch {
      setShots((cur) => cur.map((s) => (s.id === shot.id ? { ...s, pending: false } : s)));
    }
  }

  // The brand-memory loop (mirror of the product workspace): mark a model shot Keep / Hero /
  // Reject → persist its art-direction into the brand brain so the next brief leans on it.
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
            negatives: shot.negatives,
            panel: { background: scene.background, vibe: scene.vibe, lighting: scene.lighting, composition: scene.composition, format: scene.format },
            mode: "model-photoshoot", decision, at: new Date().toISOString(),
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

  const total = Math.max(1, scene.numAngles) * Math.max(1, scene.shotsPerAngle);

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <WorkBar
        brand={brandName}
        right={
          <div className="flex items-center gap-3">
            <button onClick={() => setShowBrain(true)} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Everything we know about this brand">
              <Brain size={13} /> Brand brain
            </button>
            <span className="text-[12px] text-muted">Model</span>
          </div>
        }
      />
      <BrandBrainPanel brain={brain} open={showBrain} onClose={() => setShowBrain(false)} />
      <div className="grid min-h-0 flex-1 grid-cols-[360px_340px_minmax(0,1fr)] overflow-hidden">
        {/* Model studio */}
        <div className="order-2 min-h-0 overflow-y-auto border-r border-hairline px-5 py-6">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Your model</div>
          <div className="mb-4 h-px bg-hairline" />

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-control border border-hairline p-1">
            <button onClick={() => setSource("build")} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${source === "build" ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}><UserPlus size={14} /> Build</button>
            <button onClick={() => setSource("reference")} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${source === "reference" ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}><ScanFace size={14} /> Reference</button>
          </div>

          {source === "build" ? (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-muted">Cast a specific person — skin, hair, makeup, body. Leave anything blank and I’ll choose it on-brand.</p>
              {(["gender", "ageRange", "ethnicity", "skinTone", "hairColor", "hairStyle", "eyes", "bodyType", "vibe", "expression"] as const).map((k) => (
                <Sel key={k} label={labelFor(k)} value={(model[k] as string) ?? ""} opts={MODEL_OPTIONS[k]} onChange={(v) => setM({ [k]: v })} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-muted">Paste a photo of the exact person you want. I’ll reproduce <span className="text-ink">them</span> — never beautified away — and hold their look across the set.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => refFileRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-hairline text-muted hover:border-ink hover:text-ink"><Upload size={16} /><span className="text-[10px]">Add photo</span></button>
                {modelRefs.map((p, i) => (
                  <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-card border border-ink/30">
                    <img src={thumb(p.url, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    <button onClick={() => setModelRefs((c) => c.filter((_, j) => j !== i))} className="absolute right-1 top-1 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block"><X size={11} /></button>
                  </div>
                ))}
              </div>
              {modelRefs.length >= 2 && (
                <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-muted">
                  <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} className="accent-ink" />
                  <span>Each photo is a <span className="text-ink">different person</span> (group shoot, up to 4)</span>
                </label>
              )}
            </div>
          )}

          <div className="mt-6 border-t border-hairline pt-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Product · optional</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => prodFileRef.current?.click()} className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-hairline text-muted hover:border-ink hover:text-ink"><Upload size={14} /></button>
              {products.map((p, i) => (
                <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-hairline">
                  <img src={thumb(p.url, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <button onClick={() => setProducts((c) => c.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block"><X size={10} /></button>
                </div>
              ))}
            </div>
            {products.length > 0 && <div className="mt-3"><Sel label="How it’s used" value={model.productUse ?? ""} opts={interactionOptions(detectCategory(brain.category, brain.productType, brain.name ?? brandName))} onChange={(v) => setM({ productUse: v })} /></div>}
          </div>

          <div className="mt-6 border-t border-hairline pt-4">
            <button onClick={() => setShowScene((s) => !s)} className="mb-2 flex w-full items-center justify-between text-[11px] uppercase tracking-wide text-muted hover:text-ink">
              <span>Scene · optional</span><SlidersHorizontal size={13} className={showScene ? "text-ink" : ""} />
            </button>
            {showScene && (
              <div className="grid grid-cols-1 gap-3">
                {(["background", "lighting", "vibe", "composition", "format"] as const).map((k) => (
                  <Sel key={k} label={k === "vibe" ? "mood" : k} value={scene[k]} opts={SCENE_OPTIONS[k]} onChange={(v) => setScene({ ...scene, [k]: v })} />
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Frames</span>
                    <input type="number" min={1} max={6} value={scene.numAngles} onChange={(e) => setScene({ ...scene, numAngles: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                  <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Shots / frame</span>
                    <input type="number" min={1} max={6} value={scene.shotsPerAngle} onChange={(e) => setScene({ ...scene, shotsPerAngle: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => startShoot()} disabled={busy} className="mt-6 w-full rounded-control bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40">{busy ? "Shooting…" : `Shoot ${total} image${total > 1 ? "s" : ""}`}</button>
        </div>

        {/* Canvas */}
        <div className="order-3 min-h-0 overflow-y-auto bg-surface px-7 py-7">
          {shots.length === 0 ? (
            busy ? (
              <ShootStage status={status} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted">
                <div className="flex h-40 w-40 items-center justify-center rounded-card border border-hairline"><ImageIcon size={26} strokeWidth={1.5} /></div>
                <p className="mt-4 text-sm">Your model shoot will appear here.</p>
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
                    {s.angle && <div className="mb-1 truncate text-[11px] text-muted" title={s.angle}>{s.angle}</div>}
                    {s.url && !s.pending && (
                      <div className="flex items-center gap-2.5 text-[12px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <button onClick={() => decide(s, "keep")} className={s.decision === "keep" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Keep — teach the brand this worked">Keep</button>
                        <button onClick={() => decide(s, "hero")} className={s.decision === "hero" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Hero — the standout of the set">Hero</button>
                        <button onClick={() => decide(s, "reject")} className={s.decision === "reject" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Reject — steer future shoots away from this">Reject</button>
                        <span className="h-3 w-px bg-hairline" />
                        <button onClick={() => setEditing({ id: s.id, text: "" })} className="text-muted transition-colors hover:text-ink">Change</button>
                        <button onClick={() => reshoot(s)} className="text-muted transition-colors hover:text-ink">Redo</button>
                        <button onClick={() => upscale(s)} className="flex items-center gap-1 text-muted transition-colors hover:text-ink"><Sparkles size={12} />4K</button>
                        {enhanceOn && <button onClick={() => enhance(s, "cutout")} className="text-muted transition-colors hover:text-ink">Cutout</button>}
                        {enhanceOn && <button onClick={() => enhance(s, "relight")} className="text-muted transition-colors hover:text-ink">Relight</button>}
                        <a href={s.url} download={`${s.angle || "model-shot"}.png`} className="ml-auto text-muted transition-colors hover:text-ink">Save</a>
                      </div>
                    )}
                    {editing?.id === s.id && (
                      <div className="mt-2 flex gap-2">
                        <input autoFocus value={editing.text} onChange={(e) => setEditing({ id: s.id, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyChange(s, editing!.text)} placeholder="What to change — e.g. softer light, looking away, hair down" className="flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" />
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

          <div className="border-t border-hairline px-5 py-4">
            <div className="flex items-end gap-2 rounded-card border border-hairline px-3 py-2 focus-within:border-ink">
              <button onClick={() => refFileRef.current?.click()} title="Add model reference" className="rounded-md p-1.5 text-muted hover:text-ink"><ScanFace size={18} /></button>
              <button onClick={() => prodFileRef.current?.click()} title="Add product" className="rounded-md p-1.5 text-muted hover:text-ink"><Upload size={18} /></button>
              <button onClick={() => setShowScene((s) => !s)} title="Scene controls" className={`rounded-md p-1.5 hover:text-ink ${showScene ? "text-ink" : "text-muted"}`}><SlidersHorizontal size={18} /></button>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder="Describe your model, or just say go…"
                className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none" />
              <button onClick={send} disabled={thinking || busy} title="Send" className="rounded-full bg-ink p-1.5 text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"><ArrowUp size={16} /></button>
            </div>
            <input ref={refFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setSource("reference"); addImgs(e.target.files, setModelRefs); }} />
            <input ref={prodFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImgs(e.target.files, setProducts)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function labelFor(k: string): string {
  const map: Record<string, string> = { gender: "gender", ageRange: "age", ethnicity: "heritage", skinTone: "skin", hairColor: "hair colour", hairStyle: "hair style", eyes: "eyes", bodyType: "body", vibe: "energy", expression: "expression" };
  return map[k] ?? k;
}

function Sel({ label, value, opts, onChange }: { label: string; value: string; opts: (string | { value: string; label: string })[]; onChange: (v: string) => void }) {
  const norm = opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink">
        <option value="">— from brand —</option>
        {norm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
