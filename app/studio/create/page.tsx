"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, X, ImageIcon, Loader2, RefreshCw, ArrowUp, SlidersHorizontal, Images, Sparkles, Brain, UserPlus, ScanFace, Package, UserRound, Plus, Minus, Instagram, GalleryHorizontalEnd, Megaphone, RectangleVertical, Layers, Download, Type, AlignLeft, AlignCenter, AlignRight, Shuffle } from "lucide-react";
import { WorkBar } from "@/components/tastebud/WorkBar";
import { BrandBrainPanel } from "@/components/tastebud/BrandBrainPanel";
import { BrandKitCard } from "@/components/tastebud/BrandKitCard";
import { ProductLibraryPanel } from "@/components/tastebud/ProductLibraryPanel";
import { thumb } from "@/lib/thumb";
import { numberToAspect } from "@/lib/brief";
import { CREATIVE_TYPES, FORMATS, FORMAT_IDS, isV2Type, type FormatId } from "@/lib/creativeTypes";
import { resolveBrandFonts, googleFontHref, fontVars, type BrandFonts } from "@/lib/brandFont";
import { FONT_CHOICES, BRAND_FONT_ID, resolveFontChoice, catalogFontHref } from "@/lib/fontCatalog";
import { buildCopyLayout, type LayoutBlock, type LayoutCluster } from "@/lib/copyLayout";
import { CanvasToolbar, AnnotationLayer, isDrawTool, type CanvasTool, type Anno } from "@/components/tastebud/CanvasToolbar";
import { CanvasTopBar } from "@/components/tastebud/CanvasTopBar";
import type { BrandBrain, CampaignCopy, CopyTreatment, CreativeTypeId, ModelSpec, ShotCompliance, ShotPlacement } from "@/lib/types";

/**
 * PAGE 8 — Unified Studio workspace.
 * One chat, one canvas, one shot-state — the creative-type filter bar swaps the ~40%
 * that differs between shoots (chat endpoint, control column, generate body).
 *
 * The canvas is a DOCUMENT: the whole Brand Kit sits at the top, and every generated
 * set stacks beneath it as its own labelled section (Product Photo Shoots, Model
 * Photoshoot, …) — a new run per generation, newest directly under the kit — instead of
 * one grid that gets wiped each time. Replaces the old Product/Model fork.
 */

type CreativeType = CreativeTypeId;
type Img = { name: string; url: string };
type Decision = "keep" | "reject" | "hero";
type Shot = { id: string; angle: string; prompt: string; url: string; negatives?: string[]; compliance?: ShotCompliance; aspect?: number; format?: string; seq?: number; groupId?: string; placement?: ShotPlacement; pending?: boolean; failed?: boolean; hires?: boolean; decision?: Decision; drift?: boolean; driftReasons?: string[]; saving?: boolean };
type Run = { id: string; kind: CreativeType; label: string; shots: Shot[]; copy?: CampaignCopy };
type CanvasSnapshot = { runs: Run[]; annos: Anno[] }; // one undo/redo entry — the whole canvas at a point in time
type Msg = { role: "user" | "assistant"; content: string };
type Panel = { background: string; surface: string; vibe: string; composition: string; lighting: string; styling: string; format: string; numAngles: number; shotsPerAngle: number };
type Scene = { background: string; vibe: string; lighting: string; composition: string; format: string; numAngles: number; shotsPerAngle: number };
type Brief = Partial<Panel> & { express?: string };
type Source = "build" | "reference";

// First shoot = ONE hero image the founder reacts to; an explicit count (panel or agent) overrides.
const EMPTY_PANEL: Panel = { background: "", surface: "", vibe: "", composition: "", lighting: "", styling: "", format: "", numAngles: 1, shotsPerAngle: 1 };
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

const uid = (p: string): string => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const labelFor = (kind: CreativeType): string => CREATIVE_TYPES[kind].runLabel;

/** Download a (same-origin) asset URL under a friendly filename. */
function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The copy that overlays ONE image. Carousels carry per-frame copy (frame k gets its
 * own line; the LAST frame also gets the CTA). Ads / posts / stories put the campaign
 * headline + CTA on the single hero. Returns undefined when a frame has nothing to say.
 */
function overlayForShot(kind: CreativeType, copy: CampaignCopy | undefined, seq?: number, total?: number): CampaignCopy | undefined {
  if (!copy) return undefined;
  if (kind === "carousel") {
    const f = copy.frames?.[(seq ?? 1) - 1];
    const isLast = !!seq && !!total && seq === total;
    const headline = f?.headline ?? (seq === 1 ? copy.headline : undefined);
    // The treatment (how the type stages) rides along so every frame places copy the same
    // considered way — never auto-parked at the bottom.
    const out: CampaignCopy = { ...(headline ? { headline } : {}), ...(f?.subline ? { subline: f.subline } : {}), ...(isLast && copy.cta ? { cta: copy.cta } : {}), ...(copy.treatment ? { treatment: copy.treatment } : {}) };
    return out.headline || out.cta ? out : undefined;
  }
  return copy.headline || copy.cta ? { headline: copy.headline, subline: copy.subline, cta: copy.cta, treatment: copy.treatment } : undefined;
}
const clampZoom = (z: number): number => Math.min(2, Math.max(0.25, Math.round(z * 100) / 100));

// v2 types render at a fixed aspect; ad placeholders use the feed default until the plan lands.
const defaultAspectFor = (kind: CreativeType): number => (kind === "story" ? 9 / 16 : 4 / 5);
// Map a rendered shot's numeric aspect back to the panel's format string so a reshoot /
// re-render edit comes back at the SAME aspect (a story frame must never return 4:5).
const PANEL_FORMAT: Record<string, string> = { "4:5": "Portrait 4:5", "1:1": "Square 1:1", "9:16": "Story 9:16", "16:9": "Wide 16:9" };
const panelFormatFor = (aspect?: number): string => PANEL_FORMAT[numberToAspect(aspect)] ?? "";

const OPTIONS: Record<"background" | "surface" | "vibe" | "composition" | "lighting" | "styling" | "format", string[]> = {
  background: ["Pure white", "Pure black", "Art-directed", "Match the product", "Soft cream", "Warm beige", "Sand / tan", "Blush pink", "Dusty rose", "Terracotta", "Coral / orange", "Mustard yellow", "Cherry red", "Sage green", "Olive green", "Deep forest green", "Mint", "Sky blue", "Teal", "Deep navy", "Electric blue", "Lavender", "Royal purple", "Plum", "Stone grey", "Charcoal grey", "Chocolate brown", "Soft gradient glow"],
  surface: ["Marble", "Stone", "Concrete", "Polished wood", "Raw wood", "Linen / fabric", "Wet / water", "Sand", "Glass / acrylic", "Ceramic", "Brushed metal", "Paper", "Pebbles / gravel", "Ice"],
  vibe: ["Premium / minimal", "Luxury / quiet", "Bold & vibrant", "Playful & fun", "Editorial", "Clean & clinical", "Natural / organic", "Warm & cozy", "Moody / cinematic", "Fresh & energetic", "Retro / vintage", "Futuristic / tech", "Streetwear / cool", "Sensual / tactile"],
  composition: ["Centered hero", "Rule of thirds", "Generous negative space", "Tight crop", "Overhead flat-lay", "Floating / levitation", "Grouped still life", "Symmetrical", "Diagonal / dynamic", "Single subject, minimal", "Layered depth"],
  lighting: ["Soft daylight", "Bright & airy (high-key)", "Moody / low-key", "Golden hour", "Hard sunlight & shadow", "Studio softbox", "Dramatic single-source", "Backlit / rim light", "Neon / coloured gels", "Gradient glow", "Natural window light", "Direct flash"],
  styling: ["Minimal / clean", "A few props", "Maximal — prop-rich", "Ingredient scatter", "Bold colour-block"],
  format: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"],
};

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
const PRODUCT_USE = ["Worn", "Held", "Applied", "In-context", "None"];

const SCENE_OPTIONS: Record<"background" | "vibe" | "lighting" | "composition" | "format", string[]> = {
  background: ["Pure white", "Pure black", "Art-directed", "Soft cream", "Warm beige", "Sand / tan", "Studio backdrop", "Outdoor / natural", "Urban / street", "Interior / home", "Sage green", "Deep navy", "Terracotta", "Soft gradient glow"],
  vibe: ["Premium / minimal", "Luxury / quiet", "Editorial", "Bold & vibrant", "Natural / organic", "Warm & cozy", "Moody / cinematic", "Fresh & energetic", "Streetwear / cool", "Sensual / tactile"],
  lighting: ["Soft daylight", "Bright & airy (high-key)", "Moody / low-key", "Golden hour", "Hard sunlight & shadow", "Studio softbox", "Dramatic single-source", "Backlit / rim light", "Natural window light"],
  composition: ["Centered hero", "Rule of thirds", "Generous negative space", "Tight crop", "Single subject, minimal", "Layered depth"],
  format: ["Portrait 4:5", "Square 1:1", "Story 9:16", "Wide 16:9"],
};

const opener = (type: CreativeType, brandName: string, loaded: number): string => {
  const name = brandName || "your brand";
  const productNote = loaded ? " Your product’s already loaded." : " Upload your product and we’re off.";
  if (type === "model") {
    return `Let’s shoot a model for ${name}. Build one on the left — skin, hair, makeup, body, the energy you want — or paste a photo of the exact person you have in mind and I’ll reproduce them faithfully.${loaded ? ` Your product’s already loaded.` : ""} Then just say go.`;
  }
  if (type === "instagram") return `Let’s make an Instagram creative for ${name} — one scroll-stopping feed frame, caption written for you.${productNote} Tell me the moment, or just say go.`;
  if (type === "story") return `Let’s shoot a story for ${name} — full-bleed 9:16, safe zones handled.${productNote} Tell me the moment, or just say go.`;
  if (type === "carousel") return `Let’s build a carousel for ${name} — one idea told across the swipes: a hook, the story, a close.${productNote} Give me the idea, or say go and I’ll write the arc from your brand.`;
  if (type === "ad") return `Let’s build an ad campaign for ${name} — one concept fanned across feed, square, story and landscape, headline and CTA written for you.${productNote} What are we selling — or just say go.`;
  return loaded
    ? `Shooting for ${brandName}. I’ve loaded ${loaded} product${loaded > 1 ? "s" : ""} from your library — tell me the vibe, or just hit send and I’ll shoot on-brand.`
    : `Shooting for ${brandName || "your brand"}. Upload your product and tell me what you want — or just hit send and I’ll shoot it on-brand.`;
};

const SWITCH_LINE: Record<CreativeType, string> = {
  product: "Switched to product. Tell me the vibe or just hit send — same brand, same thread.",
  model: "Switched to model. Build one on the left or paste a reference, then say go — I’ll keep the same brand and this conversation.",
  instagram: "Switched to Instagram creative — one scroll-stopping feed frame, caption included. Tell me the moment, or say go.",
  story: "Switched to story — full-bleed 9:16, safe zones handled. Tell me the moment, or say go.",
  carousel: "Switched to carousel — one idea across the swipes, hook to close. Give me the idea, or say go.",
  ad: "Switched to ad campaign — one concept fanned across every placement, headline and CTA written for you. What are we selling?",
};

const TYPE_TABS = [
  { key: "product", label: "Product", Icon: Package },
  { key: "model", label: "Model", Icon: UserRound },
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "story", label: "Story", Icon: RectangleVertical },
  { key: "carousel", label: "Carousel", Icon: GalleryHorizontalEnd },
  { key: "ad", label: "Ad campaign", Icon: Megaphone },
] as const;

export default function CreateWorkspace() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrandBrain>({});
  // Brand typography → nearest Google Font, so copy overlays render in the brand's own
  // type (live on canvas AND baked into exports). Injects one <link> per brand.
  const brandFonts = useMemo<BrandFonts>(() => resolveBrandFonts(brain.intelligence?.typography), [brain.intelligence?.typography]);
  useEffect(() => {
    const href = googleFontHref(brandFonts);
    let link = document.head.querySelector<HTMLLinkElement>("link[data-brand-font]");
    if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.setAttribute("data-brand-font", ""); document.head.appendChild(link); }
    if (link.href !== href) link.href = href;
  }, [brandFonts]);
  // Load EVERY catalog face once (a small, fixed set) so picking any typeface in the
  // Typography bar restyles the overlay instantly — no per-pick network wait.
  useEffect(() => {
    const href = catalogFontHref();
    let link = document.head.querySelector<HTMLLinkElement>("link[data-catalog-font]");
    if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.setAttribute("data-catalog-font", ""); document.head.appendChild(link); }
    if (link.href !== href) link.href = href;
  }, []);
  const [type, setType] = useState<CreativeType>("product");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  // v2 creative-type state (instagram / story / carousel / ad)
  const [frames, setFrames] = useState(5); // carousel sequence length
  const [adFormats, setAdFormats] = useState<FormatId[]>([...FORMAT_IDS]); // ad placements to fan out to
  const [concepts, setConcepts] = useState(1); // ad: distinct concepts, each fanned across placements
  const [copyDraft, setCopyDraft] = useState({ headline: "", cta: "" }); // typed copy — wins over generated
  const [overlayOff, setOverlayOff] = useState<Record<string, boolean>>({}); // per-run copy-overlay toggle
  const [adapting, setAdapting] = useState<string | null>(null); // shot id with the format menu open

  // Shared subject: products (the subjects in product mode; the optional on-model product in model mode).
  const [products, setProducts] = useState<Img[]>([]);
  // Product-mode state
  const [references, setReferences] = useState<Img[]>([]);
  const [panel, setPanel] = useState<Panel>(EMPTY_PANEL);
  const [showPanel, setShowPanel] = useState(false);
  // Model-mode state
  const [source, setSource] = useState<Source>("build");
  const [model, setModel] = useState<ModelSpec>(EMPTY_MODEL);
  const [modelRefs, setModelRefs] = useState<Img[]>([]);
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE);
  const [showScene, setShowScene] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomSmooth, setZoomSmooth] = useState(false); // animate discrete (button/key) zoom; snap for wheel/pinch/pan
  const [pan, setPan] = useState({ x: 0, y: 0 });      // infinite-canvas offset of the floating world (screen px)
  const [grabbing, setGrabbing] = useState(false);
  const [tool, setTool] = useState<CanvasTool>("select"); // active canvas tool (toolbar)
  const [boardName, setBoardName] = useState("Page 1");   // canvas top-bar board name
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null); // run the trash/duplicate act on
  const [annos, setAnnos] = useState<Anno[]>([]);         // canvas sketch annotations (draw/shape/arrow/text/sticky)
  // One shared canvas history for BOTH image sets and sketch annotations, so undo/redo
  // covers a drawing as naturally as a generated set — and lights up the moment you draw.
  const [history, setHistory] = useState<CanvasSnapshot[]>([]);
  const [future, setFuture] = useState<CanvasSnapshot[]>([]);
  const dupCount = useRef(0);
  const [contentW, setContentW] = useState(760);       // width of the floating content column

  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const modelRefFileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });               // latest pan/zoom for the wheel handler (bound once)
  const zoomRef = useRef(1);
  const panning = useRef(false);
  const panStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 });
  const panInit = useRef(false);
  const typeRef = useRef<CreativeType>("product"); // read the current type inside async closures without stale state
  typeRef.current = type;
  zoomRef.current = zoom;
  panRef.current = pan;

  // Hydrate the brand + seed products/type once from the shared session key.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc.activeBrand");
      if (raw) {
        const b = JSON.parse(raw) as BrandBrain;
        if (b?.name) {
          setBrain(b);
          const chosen = (b.catalog ?? [])
            .filter((p) => (b.selectedProductIds ?? []).includes(p.id))
            .map((p) => ({ name: p.name, url: p.images[0] }))
            .filter((p) => p.url);
          if (chosen.length) setProducts(chosen);
          // ?type= deep link — /studio/create?type=carousel etc. are the creative-type "pages".
          const qp = new URLSearchParams(window.location.search).get("type")?.toLowerCase();
          const QP_MAP: Record<string, CreativeType> = { product: "product", model: "model", instagram: "instagram", ig: "instagram", story: "story", stories: "story", carousel: "carousel", carousels: "carousel", ad: "ad", ads: "ad", "ad-campaign": "ad", campaign: "ad" };
          const fromQuery = qp ? QP_MAP[qp] : undefined;
          const uses = b.uses ?? [];
          const initial: CreativeType = fromQuery ?? (uses.includes("Model photoshoots") && !uses.includes("Product photoshoots") ? "model" : "product");
          setType(initial);
          typeRef.current = initial;
          if (isV2Type(initial)) setShowPanel(true);
          setMessages([{ role: "assistant", content: opener(initial, b.name, chosen.length) }]);
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

  // Infinite-canvas wheel (bound natively, non-passive): ⌘/Ctrl or pinch zooms toward the cursor;
  // plain scroll / two-finger swipe pans. Zoom stays a CSS transform — never the `zoom` property,
  // which corrupts click hit-testing across the whole page in Chromium.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Carousel strips scroll horizontally themselves — don't hijack a plain wheel there.
      if (!(e.ctrlKey || e.metaKey) && (e.target as HTMLElement).closest?.("[data-scroll-x]")) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const nz = clampZoom(zoomRef.current * Math.exp(-e.deltaY * 0.0022));
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const wx = (cx - panRef.current.x) / zoomRef.current;
        const wy = (cy - panRef.current.y) / zoomRef.current;
        setZoomSmooth(false);
        setZoom(nz);
        setPan({ x: cx - wx * nz, y: cy - wy * nz });
      } else {
        setZoomSmooth(false);
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Content column width tracks the viewport (capped); centre the world the first time we can.
  useEffect(() => {
    const vp = canvasViewportRef.current;
    if (!vp) return;
    const measure = () => {
      const w = Math.min(880, Math.max(520, Math.round(vp.clientWidth - 160)));
      setContentW(w);
      if (!panInit.current && vp.clientWidth) {
        panInit.current = true;
        setPan({ x: Math.max(24, (vp.clientWidth - w) / 2), y: 32 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const say = (role: Msg["role"], content: string) => setMessages((m) => [...m, { role, content }]);
  const setM = (patch: Partial<ModelSpec>) => setModel((m) => ({ ...m, ...patch }));

  // Shot lives inside a run — patch it by id wherever it is; append a sibling card into its run.
  const patchShot = (id: string, patch: Partial<Shot>) =>
    setRuns((rs) => rs.map((r) => ({ ...r, shots: r.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)) })));
  const appendCardOf = (siblingId: string, card: Shot) =>
    setRuns((rs) => rs.map((r) => (r.shots.some((s) => s.id === siblingId) ? { ...r, shots: [...r.shots, card] } : r)));
  // Typography control: merge a treatment patch into a run's copy (font / layout / scale /
  // case / align / ink). The SAME treatment drives the live overlay AND the export bake.
  const setRunTreatment = (runId: string, patch: Partial<CopyTreatment>) =>
    setRuns((rs) => rs.map((r) => (r.id === runId && r.copy ? { ...r, copy: { ...r.copy, treatment: { ...r.copy.treatment, ...patch } } } : r)));

  // ── Canvas history: undo / redo / duplicate / trash operate on the whole canvas ──
  // Every mutation snapshots the current canvas (image sets + sketch annotations) before
  // it changes, so a drawing is as undoable as a generated set. `commitRuns` mutates the
  // sets, `commitAnnos` (passed to the annotation layer) mutates the drawings; both share
  // this one stack, so undo lights up the moment you draw.
  const pushHistory = () => {
    setHistory((h) => [...h.slice(-49), { runs, annos }]);
    setFuture([]);
  };
  const commitRuns = (next: Run[]) => { pushHistory(); setRuns(next); };
  const commitAnnos = (next: Anno[]) => { pushHistory(); setAnnos(next); };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [{ runs, annos }, ...f]);
    setRuns(prev.runs);
    setAnnos(prev.annos);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    const nextSnap = future[0];
    setHistory((h) => [...h, { runs, annos }]);
    setRuns(nextSnap.runs);
    setAnnos(nextSnap.annos);
    setFuture((f) => f.slice(1));
  };
  // The run the trash/duplicate buttons target: the selected one, else the most recent.
  const targetRunId = () => selectedRunId ?? runs[0]?.id ?? null;
  const duplicateRun = () => {
    const id = targetRunId();
    const src = runs.find((r) => r.id === id);
    if (!src) return;
    const rid = `dup${++dupCount.current}-${src.id}`;
    const copy: Run = { ...src, id: rid, label: `${src.label} (copy)`, shots: src.shots.map((s, i) => ({ ...s, id: `${rid}-s${i}` })) };
    commitRuns([copy, ...runs]);
    setSelectedRunId(rid);
  };
  const trashRun = () => {
    const id = targetRunId();
    if (!id) return;
    commitRuns(runs.filter((r) => r.id !== id));
    setSelectedRunId(null);
  };
  const clearCanvas = () => { if (runs.length || annos.length) { pushHistory(); setRuns([]); setAnnos([]); } };

  // The moment a shoot starts, drop N loading boxes matching the requested count so the
  // canvas fills immediately — then reconcile onto the server's real plan, and fail any
  // box the stream never delivered.
  const optimisticStart = (runId: string, kind: CreativeType, count: number) =>
    setRuns((rs) => [{ id: runId, kind, label: labelFor(kind), shots: Array.from({ length: Math.max(1, count) }, (_, i) => ({ id: `${runId}-s${i}`, angle: "", prompt: "", url: "", aspect: defaultAspectFor(kind), pending: true })) }, ...rs]);
  const reconcileRun = (runId: string, stubs: { id: string; angle: string; aspect?: string; format?: string; seq?: number }[], aspect?: string) =>
    setRuns((rs) => rs.map((r) => {
      if (r.id !== runId) return r;
      const a = aspectNum(aspect);
      // Same count → keep the boxes in place (no flash), just adopt the real ids/angles
      // (+ each stub's own aspect/format/seq — ad fan-outs mix aspects in one run).
      if (stubs.length === r.shots.length) return { ...r, shots: r.shots.map((s, i) => ({ ...s, id: stubs[i].id, angle: stubs[i].angle, aspect: stubs[i].aspect ? aspectNum(stubs[i].aspect) : a, format: stubs[i].format, seq: stubs[i].seq })) };
      return { ...r, shots: stubs.map((st) => ({ id: st.id, angle: st.angle, prompt: "", url: "", aspect: st.aspect ? aspectNum(st.aspect) : a, format: st.format, seq: st.seq, pending: true })) };
    }));
  const failPending = (runId: string) =>
    setRuns((rs) => rs.map((r) => (r.id === runId ? { ...r, shots: r.shots.map((s) => (s.pending && !s.url ? { ...s, pending: false, failed: true } : s)) } : r)));

  function switchType(next: CreativeType) {
    if (next === type || busy || thinking) return;
    setType(next);
    typeRef.current = next;
    // v2 types surface their controls (placements, frames, copy) right away — the
    // inline panel helps here; product keeps its produce-first, panel-later flow.
    setShowPanel(isV2Type(next));
    say("assistant", SWITCH_LINE[next]);
  }

  function addImgs(files: FileList | null, set: React.Dispatch<React.SetStateAction<Img[]>>) {
    for (const f of Array.from(files ?? [])) {
      if (!f.type.startsWith("image/")) continue;
      const rd = new FileReader();
      rd.onload = () => set((p) => [...p, { name: f.name, url: String(rd.result) }]);
      rd.readAsDataURL(f);
    }
  }

  // Cmd/Ctrl+V an image straight into the composer → attach it where it belongs instead of
  // silently dropping it (the #1 "my reference did nothing" trap — there was no paste path).
  // Product mode: first image with no product yet becomes the product; otherwise it's a
  // style reference (the common "match this look" intent). Model mode: a model likeness.
  // A text-only paste falls through untouched so normal typing/pasting still works.
  function onPasteImages(e: React.ClipboardEvent) {
    const files = e.clipboardData?.files;
    if (!files?.length || !Array.from(files).some((f) => f.type.startsWith("image/"))) return;
    e.preventDefault();
    if (typeRef.current === "model") {
      setSource("reference"); addImgs(files, setModelRefs);
      say("assistant", "Got your model reference — I’ll reproduce that exact person. Say go when you’re ready.");
      return;
    }
    if (!products.length) {
      addImgs(files, setProducts);
      say("assistant", typeRef.current === "product" ? "Added that as your product. Paste a style reference too, or just say go." : "Added that as your product. Say go when you’re ready.");
      return;
    }
    // Style references are only for the product photoshoot — not the v2 creative types.
    if (typeRef.current !== "product") {
      say("assistant", "Style references only apply to product and model photoshoots. Switch to Product to match a reference.");
      return;
    }
    addImgs(files, setReferences);
    say("assistant", "Pinned that as a style reference — I’ll match its composition, palette and staging on the next shoot. Say go.");
  }

  // ── Chat ────────────────────────────────────────────────────────────────
  async function createTurn(text: string) {
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next); setThinking(true);
    try {
      if (typeRef.current === "model") {
        const state = { modelReady: source === "build" || modelRefs.length > 0, modelSource: source, hasReference: modelRefs.length > 0, productCount: products.length };
        const r = await fetch("/api/model-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, state, brand: brain.name ? brain : undefined }) });
        const j = await r.json();
        if (j.reply) say("assistant", j.reply);
        for (const a of j.actions ?? []) {
          if (a.type === "set_model_source") setSource(a.source === "reference" ? "reference" : "build");
          else if (a.type === "patch_model") setM(a.spec ?? {});
          else if (a.type === "request_reference_upload") { setSource("reference"); modelRefFileRef.current?.click(); }
          else if (a.type === "request_product_upload") fileRef.current?.click();
          else if (a.type === "show_scene") setShowScene(true);
          else if (a.type === "generate_model_shoot") await generate(a.brief ?? {});
        }
      } else {
        // product + all v2 creative types share the product-spine agent; the active
        // type rides in state so the director talks hooks/placements/frames natively.
        const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, state: { productCount: products.length, brandStatus: "have", creativeType: typeRef.current }, brand: brain }) });
        const j = await r.json();
        if (j.reply) say("assistant", j.reply);
        for (const a of j.actions ?? []) {
          if (a.type === "show_panel") setShowPanel(true);
          else if (a.type === "generate_shoot") await generate(a.brief ?? {});
        }
      }
    } catch { say("assistant", "I hit a snag — try that again?"); }
    setThinking(false);
  }

  function send() {
    if (thinking || busy) return;
    const text = input.trim();
    if (!text) {
      if (type === "model") { startModelShoot(); return; }
      if (!products.length) { say("assistant", "Add your product photo first — use the upload button."); fileRef.current?.click(); return; }
      say("assistant", references.length ? "Generating — matching your reference." : "Generating your shoot."); generate({}); return;
    }
    setInput(""); createTurn(text);
  }

  function startModelShoot() {
    if (source === "reference" && !modelRefs.length) { say("assistant", "Paste a photo of your model first and I’ll reproduce that exact person."); setSource("reference"); modelRefFileRef.current?.click(); return; }
    say("assistant", source === "reference" ? "Shooting — staying faithful to your model." : "Shooting your model now.");
    generate({});
  }

  // ── Generation pipeline (shared) ──────────────────────────────────────────
  async function stream(body: object, h: { onPlan: (s: { id: string; angle: string; aspect?: string; format?: string; seq?: number }[], a?: string) => void; onShot: (s: Shot) => void; onError: (id?: string, error?: string) => void; onReshoot: (id: string) => void; onCopy?: (c: CampaignCopy) => void; onPlacement?: (id: string, placement: ShotPlacement) => void }) {
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
        else if (m.type === "copy") h.onCopy?.(m.copy ?? {});
        else if (m.type === "qc") h.onReshoot(m.id);
        else if (m.type === "shot") h.onShot(m.shot);
        else if (m.type === "placement") h.onPlacement?.(m.id, m.placement ?? {});
        else if (m.type === "shotError") h.onError(m.id, m.error);
        else if (m.type === "error") say("assistant", `Generation error: ${m.error}`);
      }
    }
  }

  // Build the /api/generate body for the active type.
  function productBody(express: string, p: Panel, productsOverride?: string[]) {
    // Style references belong to the plain product photoshoot only — never the v2 creative
    // types (instagram / story / carousel / ad), which ride this same body. The server
    // enforces this too, but don't even send them for a v2 run.
    const refs = typeRef.current === "product" ? references.map((r) => r.url) : [];
    return { mode: "product-photoshoot", express, panel: p, products: productsOverride ?? products.map((x) => x.url), references: refs, brand: brain };
  }
  function modelBody(express: string, sc: Scene, spec: ModelSpec) {
    return {
      mode: "model-photoshoot",
      express,
      panel: { background: sc.background, vibe: sc.vibe, lighting: sc.lighting, composition: sc.composition, format: sc.format, numAngles: sc.numAngles, shotsPerAngle: sc.shotsPerAngle },
      products: products.map((p) => p.url),
      modelRefs: spec.source === "reference" ? modelRefs.map((r) => r.url) : [],
      model: spec,
      brand: brain.name ? brain : undefined,
    };
  }

  async function generate(brief: Brief & { productUse?: string }) {
    const kind = typeRef.current;
    const runId = uid("run");
    let errSurfaced = false;
    const surfaceGenError = (error?: string) => {
      if (errSurfaced || !error) return;
      errSurfaced = true;
      if (/credit|billing|prepay|deplet|exhaust|quota|hard limit|spend/i.test(error)) say("assistant", "This isn’t your brief — the connected image-generation account has hit its billing / spend limit, so new renders are being refused. Raise the spend limit (or top up billing) on the image provider, then hit retry.");
      else say("assistant", `The shoot hit an error: ${error}`);
    };

    if (kind === "model") {
      if (source === "reference" && !modelRefs.length) { say("assistant", "I’ll need your model’s photo first — paste it on the left."); setSource("reference"); return; }
      const merged: Scene = { ...scene };
      (["background", "vibe", "lighting", "composition", "format"] as const).forEach((k) => { if (!merged[k] && brief[k]) (merged[k] as string) = brief[k] as string; });
      if (typeof brief.numAngles === "number") merged.numAngles = brief.numAngles;
      if (typeof brief.shotsPerAngle === "number") merged.shotsPerAngle = brief.shotsPerAngle;
      if (brief.productUse && !model.productUse) setM({ productUse: brief.productUse });
      const spec: ModelSpec = { ...model, source, productUse: model.productUse || brief.productUse || "" };
      const expected = Math.max(1, merged.numAngles) * Math.max(1, merged.shotsPerAngle);
      setBusy(true); setStatus("Casting and art-directing…");
      optimisticStart(runId, kind, expected);
      try {
        await stream(modelBody(brief.express ?? "", merged, spec), {
          onPlan: (stubs, aspect) => { setStatus(`Shooting ${stubs.length} frame${stubs.length > 1 ? "s" : ""}…`); reconcileRun(runId, stubs, aspect); },
          onReshoot: (id) => patchShot(id, { pending: true }),
          onShot: (s) => patchShot(s.id, { ...s, aspect: aspectNum(s.aspect), pending: false, failed: false }),
          onError: (id, error) => { if (id) patchShot(id, { pending: false, failed: true }); surfaceGenError(error); },
        });
      } catch (e) { say("assistant", `Generation hit an error: ${(e as Error).message}`); }
      failPending(runId); setBusy(false); setStatus(""); return;
    }

    // Product spine — product photoshoot + the v2 creative types (instagram / story / carousel / ad)
    if (!products.length) { say("assistant", "I’ll need your product photo first — use the upload button."); return; }
    const merged: Panel = { ...panel };
    (["background", "surface", "vibe", "lighting", "composition", "styling", "format"] as const).forEach((k) => { if (!merged[k] && brief[k]) (merged[k] as string) = brief[k] as string; });
    if (typeof brief.numAngles === "number") merged.numAngles = brief.numAngles;
    if (typeof brief.shotsPerAngle === "number") merged.shotsPerAngle = brief.shotsPerAngle;
    let expected = Math.max(1, merged.numAngles) * Math.max(1, merged.shotsPerAngle);

    // v2 extras ride the same body: the type, its frame count / placements, typed copy.
    const extras: Record<string, unknown> = {};
    if (isV2Type(kind)) {
      merged.format = ""; // aspect is fixed by the type server-side
      merged.shotsPerAngle = 1;
      extras.creativeType = kind;
      const headline = copyDraft.headline.trim();
      const cta = copyDraft.cta.trim();
      if (headline || cta) extras.copy = { ...(headline ? { headline } : {}), ...(cta ? { cta } : {}) };
      if (kind === "ad") {
        merged.numAngles = Math.max(1, Math.min(3, concepts));
        const placements = adFormats.length ? adFormats : [...FORMAT_IDS];
        extras.formats = placements;
        expected = merged.numAngles * placements.length;
      } else if (kind === "carousel") {
        // "6 frames" said in chat lands as numAngles — honour it as the sequence length.
        const n = typeof brief.numAngles === "number" && brief.numAngles > 1 ? Math.max(3, Math.min(8, brief.numAngles)) : frames;
        if (n !== frames) setFrames(n);
        extras.frames = n;
        merged.numAngles = 1;
        expected = n;
      } else {
        expected = Math.max(1, merged.numAngles);
      }
    }

    const STATUS_FOR: Partial<Record<CreativeType, string>> = { ad: "Art-directing the campaign…", carousel: "Writing the arc, art-directing…", instagram: "Art-directing your creative…", story: "Art-directing your story…" };
    setBusy(true); setStatus(STATUS_FOR[kind] ?? "Art-directing the shoot…");
    optimisticStart(runId, kind, expected);
    try {
      await stream({ ...productBody(brief.express ?? "", merged), ...extras }, {
        onPlan: (stubs, aspect) => { setStatus(kind === "ad" ? `Rendering ${stubs.length} placements…` : kind === "carousel" ? `Shooting ${stubs.length} frames…` : `Shooting ${stubs.length} image${stubs.length > 1 ? "s" : ""}…`); reconcileRun(runId, stubs, aspect); },
        onReshoot: (id) => patchShot(id, { pending: true }),
        onShot: (s) => patchShot(s.id, { ...s, aspect: aspectNum(s.aspect), pending: false, failed: false }),
        onError: (id, error) => { if (id) patchShot(id, { pending: false, failed: true }); surfaceGenError(error); },
        onCopy: (copy) => setRuns((rs) => rs.map((r) => (r.id === runId ? { ...r, copy } : r))),
        onPlacement: (id, placement) => patchShot(id, { placement }),
      });
    } catch (e) { say("assistant", `Generation hit an error: ${(e as Error).message}`); }
    failPending(runId); setBusy(false); setStatus("");
  }

  // A single one-off frame (used by reshoot / re-render edits). `format` pins the
  // aspect so a story/landscape card comes back at its own shape, not the default.
  async function single(express: string, opts?: { products?: string[]; format?: string }): Promise<Shot | null> {
    let out: Shot | null = null;
    const body = typeRef.current === "model"
      ? modelBody(express, { ...scene, numAngles: 1, shotsPerAngle: 1, ...(opts?.format ? { format: opts.format } : {}) }, { ...model, source })
      : productBody(express, { ...panel, numAngles: 1, shotsPerAngle: 1, ...(opts?.format ? { format: opts.format } : {}) }, opts?.products);
    await stream(body, { onPlan: () => {}, onReshoot: () => {}, onError: () => {}, onShot: (s) => { if (!out) out = { ...s, aspect: aspectNum(s.aspect) }; } });
    return out;
  }

  async function reshoot(shot: Shot) {
    setBusy(true); setStatus("Re-shooting…");
    patchShot(shot.id, { pending: true, failed: false });
    const r = await single(shot.angle, { format: panelFormatFor(shot.aspect) });
    patchShot(shot.id, r ? { url: r.url, aspect: r.aspect, pending: false, failed: false } : { pending: false, failed: true });
    setBusy(false); setStatus("");
  }

  async function applyChange(shot: Shot, text: string) {
    if (!text.trim()) return;
    setEditing(null); setBusy(true); setStatus("Changing…");
    patchShot(shot.id, { pending: true });
    // With Replicate on, route through FLUX Kontext — a true instruction edit that keeps the rest
    // faithful and re-injects stored compliance (product + model identity lock). Else re-render.
    if (enhanceOn) {
      try {
        const r = await fetch("/api/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "edit", src: shot.url, prompt: text, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name }) });
        const j = await r.json();
        patchShot(shot.id, j.url ? { url: j.url, hires: false, pending: false, drift: !!j.drift, driftReasons: j.driftReasons ?? [] } : { pending: false });
      } catch { patchShot(shot.id, { pending: false }); }
      setBusy(false); setStatus(""); return;
    }
    const r = typeRef.current === "model" ? await single(`${shot.angle}. ${text}`, { format: panelFormatFor(shot.aspect) }) : await single(text, { products: [shot.url], format: panelFormatFor(shot.aspect) });
    patchShot(shot.id, r ? { url: r.url, pending: false } : { pending: false });
    setBusy(false); setStatus("");
  }

  // Fidelity-safe reformat — adapt a keeper to another placement (crop / outpaint /
  // pad, NEVER a silent re-render; the shot's compliance rides through the edit).
  // Appends a NEW card so the original is kept.
  async function adapt(shot: Shot, format: FormatId) {
    setAdapting(null); setBusy(true); setStatus(`Adapting to ${FORMATS[format].label}…`);
    try {
      const r = await fetch("/api/reformat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ src: shot.url, format, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name }) });
      const j = await r.json();
      if (j.url) appendCardOf(shot.id, { id: `${shot.id}-${format}-${Math.random().toString(36).slice(2, 6)}`, angle: `${shot.angle} · ${FORMATS[format].label}`, prompt: "", url: j.url, aspect: aspectNum(j.aspect), format, compliance: shot.compliance, drift: !!j.drift, driftReasons: j.driftReasons ?? [] });
      else say("assistant", j.error || "Adapting failed.");
    } catch (e) { say("assistant", `Adapting hit an error: ${(e as Error).message}`); }
    setBusy(false); setStatus("");
  }

  // Open-source enhancers (Replicate). Cutout/relight append a NEW card into the same run so the original is kept.
  async function enhance(shot: Shot, action: "cutout" | "relight", prompt?: string) {
    setBusy(true); setStatus(action === "cutout" ? "Cutting out…" : "Relighting…");
    try {
      const r = await fetch("/api/enhance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, src: shot.url, prompt, compliance: shot.compliance, productRef: products[0]?.url, brand: brain.name }) });
      const j = await r.json();
      if (j.url) {
        const tag = action === "cutout" ? "cutout" : "relit";
        appendCardOf(shot.id, { id: `${shot.id}-${tag}-${Math.random().toString(36).slice(2, 6)}`, angle: `${shot.angle} · ${tag}`, prompt: "", url: j.url, aspect: shot.aspect });
      } else { say("assistant", j.error || `${action} failed.`); }
    } catch (e) { say("assistant", `${action} hit an error: ${(e as Error).message}`); }
    setBusy(false); setStatus("");
  }

  async function upscale(shot: Shot) {
    patchShot(shot.id, { pending: true });
    try {
      const r = await fetch("/api/upscale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: shot.url, aspect: shot.aspect }) });
      const j = await r.json();
      patchShot(shot.id, { url: j.url || shot.url, hires: Boolean(j.url), pending: false });
    } catch {
      patchShot(shot.id, { pending: false });
    }
  }

  // Save an asset. With copy → POST /api/export to bake the headline/CTA into the pixels
  // in the brand's own type (satori + resvg), then download that. Without copy → the raw
  // plate downloads directly. Either way the file lands in the brand's Asset Studio.
  async function saveWithCopy(shot: Shot, copy?: CampaignCopy) {
    const name = (shot.angle || (type === "model" ? "model-shot" : "asset")).replace(/[^\w-]+/g, "-").toLowerCase();
    const hasText = Boolean(copy && (copy.headline || copy.cta));
    if (!hasText) { triggerDownload(shot.url, `${name}.png`); return; }
    patchShot(shot.id, { saving: true });
    // Bake in the run's chosen typeface (Typography bar) — falls back to the brand's pair.
    const exportFonts = resolveFontChoice(copy?.treatment?.fontId, brandFonts);
    // A user-pinned treatment governs positioning; only merge the auto per-shot placement
    // when they HAVEN'T taken manual control — otherwise their chosen layout must win.
    const bakeCopy = copy && !copy.treatment?.pinned && shot.placement && Object.keys(shot.placement).length
      ? { ...copy, treatment: { ...copy.treatment, ...shot.placement } }
      : copy;
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          src: shot.url,
          aspect: shot.aspect,
          copy: bakeCopy,
          brand: brain.name || undefined,
          fonts: {
            display: { family: exportFonts.display.family, weight: exportFonts.display.weight },
            text: { family: exportFonts.text.family, weight: exportFonts.text.weight },
          },
        }),
      });
      const j = await r.json();
      if (j.url) triggerDownload(j.url, `${name}-titled.png`);
      else triggerDownload(shot.url, `${name}.png`); // export failed → at least save the plate
    } catch {
      triggerDownload(shot.url, `${name}.png`);
    } finally {
      patchShot(shot.id, { saving: false });
    }
  }

  // The brand-memory loop: Keep / Hero / Reject → persist the winning (or rejected)
  // art-direction into the brand brain so the NEXT brief leans on it.
  async function decide(shot: Shot, decision: Decision) {
    if (!brain.name || !shot.url || shot.pending) return;
    patchShot(shot.id, { decision });
    const snapshot = typeRef.current === "model"
      ? { background: scene.background, vibe: scene.vibe, lighting: scene.lighting, composition: scene.composition, format: scene.format }
      : panel;
    try {
      const r = await fetch(`/api/brains/${slugify(brain.name)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: {
            id: shot.id, url: shot.url, angle: shot.angle, prompt: shot.prompt, negatives: shot.negatives,
            panel: snapshot, mode: typeRef.current === "model" ? "model-photoshoot" : "product-photoshoot", decision,
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

  // Discrete zoom (buttons / reset): multiplicative step + a snappy animated transition.
  // Zoom toward a viewport point, keeping that point fixed under the cursor.
  const zoomToward = (nzRaw: number, cx: number, cy: number) => {
    const nz = clampZoom(nzRaw);
    const wx = (cx - panRef.current.x) / zoomRef.current;
    const wy = (cy - panRef.current.y) / zoomRef.current;
    setZoom(nz);
    setPan({ x: cx - wx * nz, y: cy - wy * nz });
  };
  const stepZoom = (factor: number) => {
    setZoomSmooth(true);
    const vp = canvasViewportRef.current;
    zoomToward(zoom * factor, vp ? vp.clientWidth / 2 : 0, vp ? vp.clientHeight / 2 : 0);
  };
  const resetZoom = () => {
    setZoomSmooth(true);
    const vp = canvasViewportRef.current;
    setZoom(1);
    if (vp) setPan({ x: Math.max(24, (vp.clientWidth - contentW) / 2), y: 32 });
  };

  // Drag empty canvas to pan; clicks on cards/controls pass through (excluded targets don't start a pan).
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    if (isDrawTool(tool)) return; // a draw tool owns the pointer — the annotation layer captures it
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-no-pan]")) return;
    panning.current = true;
    setGrabbing(true);
    setZoomSmooth(false);
    panStart.current = { px: e.clientX, py: e.clientY, ox: panRef.current.x, oy: panRef.current.y };
    canvasViewportRef.current?.setPointerCapture(e.pointerId);
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!panning.current) return;
    setPan({ x: panStart.current.ox + (e.clientX - panStart.current.px), y: panStart.current.oy + (e.clientY - panStart.current.py) });
  }
  function onCanvasPointerUp(e: React.PointerEvent) {
    if (!panning.current) return;
    panning.current = false;
    setGrabbing(false);
    canvasViewportRef.current?.releasePointerCapture?.(e.pointerId);
  }

  const total = Math.max(1, type === "model" ? scene.numAngles : panel.numAngles) * Math.max(1, type === "model" ? scene.shotsPerAngle : panel.shotsPerAngle);
  const showMiddle = type === "model" || showPanel;
  const middleWidth = type === "model" ? "340px" : "300px";

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      <WorkBar
        brand={brain.name}
        right={
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/studio/campaigns")} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Every campaign, carousel and creative this brand has produced">
              <Layers size={13} /> Campaigns
            </button>
            <button onClick={() => setShowLibrary(true)} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Your product library">
              <Images size={13} /> Library
            </button>
            <button onClick={() => setShowBrain(true)} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:border-ink" title="Everything we know about this brand">
              <Brain size={13} /> Brand brain
            </button>
          </div>
        }
      />

      {/* Creative-type filter bar — swaps the creative type without leaving the workspace */}
      <div className="flex items-center gap-2 border-b border-hairline px-6 py-2.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">Create</span>
        {TYPE_TABS.map(({ key, label, Icon }) => {
          const on = type === key;
          return (
            <button
              key={key}
              onClick={() => switchType(key)}
              disabled={busy || thinking}
              title={CREATIVE_TYPES[key].blurb}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-muted hover:border-ink hover:text-ink"}`}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <BrandBrainPanel brain={brain} open={showBrain} onClose={() => setShowBrain(false)} />
      <ProductLibraryPanel
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        brandName={brain.name}
        catalog={brain.catalog ?? []}
        products={products}
        onAdd={(p) => setProducts((cur) => (cur.some((x) => x.url === p.url) ? cur : [...cur, p]))}
        onRemove={(url) => setProducts((cur) => cur.filter((x) => x.url !== url))}
        onUpload={(files) => addImgs(files, setProducts)}
      />

      <div className="grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: showMiddle ? `360px ${middleWidth} minmax(0,1fr)` : "360px minmax(0,1fr)" }}>
        {/* ── Middle control column ─────────────────────────────────────────── */}
        {showMiddle && (
          <div className="order-2 min-h-0 overflow-y-auto border-r border-hairline px-5 py-6">
            {type === "model" ? (
              <>
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
                      <Sel key={k} label={modelLabel(k)} value={(model[k] as string) ?? ""} opts={MODEL_OPTIONS[k]} onChange={(v) => setM({ [k]: v })} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[12px] leading-relaxed text-muted">Paste a photo of the exact person you want. I’ll reproduce <span className="text-ink">them</span> — never beautified away — and hold their look across the set.</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => modelRefFileRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-hairline text-muted hover:border-ink hover:text-ink"><Upload size={16} /><span className="text-[10px]">Add photo</span></button>
                      {modelRefs.map((p, i) => (
                        <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-card border border-ink/30">
                          <img src={thumb(p.url, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          <button onClick={() => setModelRefs((c) => c.filter((_, j) => j !== i))} className="absolute right-1 top-1 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block"><X size={11} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-6 border-t border-hairline pt-4">
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Product · optional</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => fileRef.current?.click()} className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-hairline text-muted hover:border-ink hover:text-ink"><Upload size={14} /></button>
                    {products.map((p, i) => (
                      <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-hairline">
                        <img src={thumb(p.url, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        <button onClick={() => setProducts((c) => c.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 hidden rounded-full bg-ink/80 p-0.5 text-canvas group-hover:block"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                  {products.length > 0 && <div className="mt-3"><Sel label="How it’s used" value={model.productUse ?? ""} opts={PRODUCT_USE} onChange={(v) => setM({ productUse: v })} /></div>}
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
                <button onClick={startModelShoot} disabled={busy} className="mt-6 w-full rounded-control bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40">{busy ? "Shooting…" : `Shoot ${total} image${total > 1 ? "s" : ""}`}</button>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted">{isV2Type(type) ? CREATIVE_TYPES[type].label : "Fine-tune"}</span>
                  <button onClick={() => setShowPanel(false)} className="text-muted transition-colors hover:text-ink" title="Close fine-tune"><X size={14} /></button>
                </div>
                <p className="mb-4 text-[13px] leading-relaxed text-muted">{isV2Type(type) ? `${CREATIVE_TYPES[type].blurb} Leave anything blank and I’ll choose it on-brand.` : "Leave anything blank and I’ll choose it on-brand. The canvas is the star — talk to me to refine."}</p>
                <div className="grid grid-cols-1 gap-3">
                  {type === "ad" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wide text-muted">Placements</span>
                        <div className="flex flex-wrap gap-1.5">
                          {FORMAT_IDS.map((f) => {
                            const on = adFormats.includes(f);
                            return (
                              <button key={f} onClick={() => setAdFormats((cur) => (on ? cur.filter((x) => x !== f) : [...cur, f]))} className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${on ? "border-ink bg-ink text-canvas" : "border-hairline text-muted hover:border-ink hover:text-ink"}`}>
                                {FORMATS[f].label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Concepts</span><span className="text-[10px] normal-case text-muted/70">distinct ideas, each fanned across placements</span>
                        <input type="number" min={1} max={3} value={concepts} onChange={(e) => setConcepts(Math.max(1, Math.min(3, Number(e.target.value))))} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Headline · optional</span>
                        <input value={copyDraft.headline} onChange={(e) => setCopyDraft((c) => ({ ...c, headline: e.target.value }))} placeholder="Written for you if blank" className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm placeholder:text-muted/60 focus:border-ink" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">CTA · optional</span>
                        <input value={copyDraft.cta} onChange={(e) => setCopyDraft((c) => ({ ...c, cta: e.target.value }))} placeholder="e.g. Shop now" className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm placeholder:text-muted/60 focus:border-ink" /></label>
                    </>
                  )}
                  {type === "carousel" && (
                    <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Frames</span><span className="text-[10px] normal-case text-muted/70">swipes in the sequence — hook to close</span>
                      <input type="number" min={3} max={8} value={frames} onChange={(e) => setFrames(Math.max(3, Math.min(8, Number(e.target.value))))} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                  )}
                  {(type === "instagram" || type === "story") && (
                    <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Options</span><span className="text-[10px] normal-case text-muted/70">alternate takes to choose from</span>
                      <input type="number" min={1} max={6} value={panel.numAngles} onChange={(e) => setPanel({ ...panel, numAngles: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                  )}
                  {(isV2Type(type) ? (["background", "vibe", "lighting", "composition", "surface", "styling"] as const) : (["background", "vibe", "lighting", "composition", "surface", "styling", "format"] as const)).map((k) => (
                    <Sel key={k} label={k} value={panel[k]} opts={OPTIONS[k]} onChange={(v) => setPanel({ ...panel, [k]: v })} />
                  ))}
                  {type === "product" && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Angles</span><span className="text-[10px] normal-case text-muted/70">how many angles</span>
                        <input type="number" min={1} max={6} value={panel.numAngles} onChange={(e) => setPanel({ ...panel, numAngles: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted">Shots</span><span className="text-[10px] normal-case text-muted/70">pictures per angle</span>
                        <input type="number" min={1} max={6} value={panel.shotsPerAngle} onChange={(e) => setPanel({ ...panel, shotsPerAngle: Math.max(1, Math.min(6, Number(e.target.value))) })} className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" /></label>
                    </div>
                  )}
                  <button onClick={() => generate({ express: input.trim() })} disabled={busy || !products.length} className="mt-1 rounded-control bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40">
                    {busy ? "Working…"
                      : type === "ad" ? `Generate campaign — ${Math.max(1, concepts) * Math.max(1, adFormats.length)} assets`
                      : type === "carousel" ? `Generate ${frames} frames`
                      : type === "instagram" || type === "story" ? `Generate ${panel.numAngles} option${panel.numAngles > 1 ? "s" : ""}`
                      : `Generate ${panel.numAngles * panel.shotsPerAngle} image${panel.numAngles * panel.shotsPerAngle > 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Infinite canvas — white dotted space; brand kit + shoots float; drag to pan, wheel/pinch to zoom ─── */}
        <div
          ref={canvasViewportRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
          className="relative order-3 min-h-0 select-none overflow-hidden bg-canvas"
          style={{ cursor: grabbing ? "grabbing" : "grab" }}
        >
          {/* dotted infinite space — subtle grey dots on white; spacing scales with zoom, grid shifts with pan */}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1.5px)", backgroundSize: `${Math.max(9, 26 * zoom)}px ${Math.max(9, 26 * zoom)}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }} />
          {/* Floating white top bar — menu · board name · undo/redo · duplicate · trash · more */}
          <CanvasTopBar
            boardName={boardName}
            onRename={setBoardName}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            onUndo={undo}
            onRedo={redo}
            onDuplicate={duplicateRun}
            onTrash={trashRun}
            canDuplicate={runs.length > 0}
            canTrash={runs.length > 0}
            menuItems={[
              { label: "Brand kit", onClick: () => setShowBrain(true) },
              { label: "Product library", onClick: () => setShowLibrary(true) },
              { label: "Back to studio", onClick: () => router.push("/studio") },
            ]}
            moreItems={[
              { label: "Reset zoom to 100%", onClick: resetZoom },
              { label: "Clear canvas", onClick: clearCanvas, danger: true },
            ]}
          />

          {/* the floating world — translated by pan, scaled by zoom */}
          <div
            ref={canvasContentRef}
            className="absolute left-0 top-0 space-y-6"
            style={{ width: contentW, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transformOrigin: "0 0", transition: zoomSmooth ? "transform 160ms cubic-bezier(0.4,0,0.2,1)" : undefined, willChange: "transform", ...fontVars(brandFonts) }}
          >
            {brain.name && <BrandKitCard brain={brain} />}

            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-canvas/60 py-16 text-center text-muted">
                <ImageIcon size={24} strokeWidth={1.5} />
                <p className="mt-3 max-w-xs text-sm">{type === "model" ? "Build your model and say go" : isV2Type(type) ? "Tell me the idea, or just hit send" : "Tell me the vibe, or just hit send"} — your {isV2Type(type) ? CREATIVE_TYPES[type].runLabel.toLowerCase() : "images"} build{isV2Type(type) ? "s" : ""} here, beneath the brand kit.</p>
              </div>
            ) : (
              runs.map((run) => {
                const done = run.shots.filter((s) => s.url && !s.pending).length;
                const frameCount = run.shots.length;
                const hasCopy = Boolean(run.copy && (run.copy.headline || run.copy.caption || run.copy.cta || run.copy.frames?.length));
                const overlaysOn = hasCopy && !overlayOff[run.id];
                // The run's chosen typeface (Typography bar) → real font pair, brand by default.
                const overlayFonts = resolveFontChoice(run.copy?.treatment?.fontId, brandFonts);
                const fontVarStyle = {
                  "--brand-display": overlayFonts.display.cssStack,
                  "--brand-text": overlayFonts.text.cssStack,
                  "--brand-display-tracking": overlayFonts.display.tracking,
                  "--brand-text-tracking": overlayFonts.text.tracking,
                } as CSSProperties;
                // Copy overlays on the image for EVERY placement that carries copy —
                // ads / posts / stories on the single hero, and carousels per frame
                // (frame k gets its own line, the last frame gets the CTA).
                const cardProps = {
                  type: run.kind, enhanceOn, brandFonts, overlayFonts, onSave: saveWithCopy, editing, setEditing, adapting, setAdapting,
                  onDecide: decide, onReshoot: reshoot, onApplyChange: applyChange, onUpscale: upscale, onEnhance: enhance, onAdapt: adapt,
                } as const;
                return (
                  <section key={run.id} onClick={() => setSelectedRunId(run.id)} className={`rounded-card p-2 transition-colors ${selectedRunId === run.id ? "bg-surface ring-1 ring-hairline" : ""}`}>
                    <div className="mb-3 flex items-baseline gap-2">
                      <button data-no-pan onClick={(e) => { e.stopPropagation(); setSelectedRunId(selectedRunId === run.id ? null : run.id); }} className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${selectedRunId === run.id ? "bg-ink text-canvas" : "bg-canvas/70 text-muted hover:text-ink"}`} title="Select this set — the toolbar's duplicate/delete act on it">{run.label}</button>
                      <span className="text-[11px] text-muted">· {done}/{run.shots.length}</span>
                      {hasCopy && (
                        <button data-no-pan onClick={() => setOverlayOff((o) => ({ ...o, [run.id]: !o[run.id] }))} className="ml-auto text-[11px] text-muted transition-colors hover:text-ink">
                          {overlayOff[run.id] ? "Show copy" : "Hide copy"}
                        </button>
                      )}
                    </div>
                    {/* Typography controls — pick the typeface, where the type sits, its scale/case/align/ink.
                       Live on the canvas AND baked into the export. Only where copy overlays a creative. */}
                    {overlaysOn && isV2Type(run.kind) && (
                      <TypographyBar treatment={run.copy?.treatment} brandFonts={brandFonts} onChange={(patch) => setRunTreatment(run.id, patch)} />
                    )}
                    {/* Copy is DATA riding with the campaign — edit a headline and it updates on the spot, never re-rendered. Shown in the chosen type. */}
                    {overlaysOn && (
                      <div className="mb-3 rounded-card border border-hairline bg-canvas px-4 py-3" style={fontVarStyle}>
                        {run.copy?.headline && <div className="text-[15px] font-medium text-ink" style={{ fontFamily: "var(--brand-display)", letterSpacing: "var(--brand-display-tracking)" }}>{run.copy.headline}</div>}
                        {run.copy?.subline && <div className="mt-0.5 text-[13px] text-muted" style={{ fontFamily: "var(--brand-text)" }}>{run.copy.subline}</div>}
                        {(run.copy?.cta || run.copy?.caption) && (
                          <div className="mt-1.5 flex items-baseline gap-2.5">
                            {run.copy?.cta && <span className="shrink-0 rounded-full border border-ink px-2.5 py-0.5 text-[11px] text-ink" style={{ fontFamily: "var(--brand-text)" }}>{run.copy.cta}</span>}
                            {run.copy?.caption && <span className="text-[12px] leading-relaxed text-muted">{run.copy.caption}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {run.kind === "carousel" ? (
                      /* the carousel is an ORDERED horizontal strip — swipe order is the design; each frame carries its own on-image copy */
                      <div data-scroll-x className="flex gap-4 overflow-x-auto pb-2">
                        {run.shots.map((s) => (
                          <div key={s.id} className="w-[240px] shrink-0">
                            <ShotCard s={s} copy={overlaysOn ? overlayForShot("carousel", run.copy, s.seq, frameCount) : undefined} {...cardProps} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
                        {run.shots.map((s) => (
                          <ShotCard key={s.id} s={s} copy={overlaysOn ? overlayForShot(run.kind, run.copy) : undefined} {...cardProps} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            )}
            {/* annotation layer — inside the transform so drawings pan/zoom with the work */}
            <AnnotationLayer tool={tool} annos={annos} onCommit={commitAnnos} />
          </div>
          {/* Zoom control — fixed bottom-left, unscaled (⌘/Ctrl + scroll / pinch also zooms) */}
          <div data-no-pan className="absolute bottom-4 left-4 flex items-center gap-0.5 rounded-full border border-hairline bg-canvas/90 px-1.5 py-1 shadow-card backdrop-blur">
            <button onClick={() => stepZoom(1 / 1.25)} disabled={zoom <= 0.25} className="rounded-full p-1.5 text-muted transition-colors hover:text-ink disabled:opacity-30" title="Zoom out"><Minus size={14} /></button>
            <button onClick={resetZoom} className="min-w-[46px] text-center text-[12px] tabular-nums text-ink transition-opacity hover:opacity-60" title="Reset to 100%">{Math.round(zoom * 100)}%</button>
            <button onClick={() => stepZoom(1.25)} disabled={zoom >= 2} className="rounded-full p-1.5 text-muted transition-colors hover:text-ink disabled:opacity-30" title="Zoom in"><Plus size={14} /></button>
          </div>
          {/* Floating Canvas Toolbar — bottom-center, unscaled */}
          <CanvasToolbar tool={tool} onTool={setTool} onInsertImage={() => fileRef.current?.click()} />
        </div>

        {/* ── Chat — left ────────────────────────────────────────────────────── */}
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

          {type === "product" && references.length > 0 && (
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
          {type === "product" && products.length > 0 && (
            <div className="px-5 pb-2 text-[12px] text-muted">
              {products.length} product{products.length > 1 ? "s" : ""} in this shoot ·{" "}
              <button onClick={() => setShowLibrary(true)} className="text-ink underline-offset-2 transition-opacity hover:opacity-70">Open library</button>
            </div>
          )}

          <div className="border-t border-hairline px-5 py-4">
            <div className="flex items-end gap-2 rounded-card border border-hairline px-3 py-2 focus-within:border-ink">
              {type === "model" ? (
                <>
                  <button onClick={() => modelRefFileRef.current?.click()} title="Add model reference" className="rounded-md p-1.5 text-muted hover:text-ink"><ScanFace size={18} /></button>
                  <button onClick={() => fileRef.current?.click()} title="Add product" className="rounded-md p-1.5 text-muted hover:text-ink"><Upload size={18} /></button>
                  <button onClick={() => setShowScene((s) => !s)} title="Scene controls" className={`rounded-md p-1.5 hover:text-ink ${showScene ? "text-ink" : "text-muted"}`}><SlidersHorizontal size={18} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => fileRef.current?.click()} title="Add product photo" className="rounded-md p-1.5 text-muted hover:text-ink"><Upload size={18} /></button>
                  {type === "product" && <button onClick={() => refFileRef.current?.click()} title="Add style reference" className="rounded-md p-1.5 text-muted hover:text-ink"><Images size={18} /></button>}
                  <button onClick={() => setShowPanel((s) => !s)} title="Fine-tune panel" className={`rounded-md p-1.5 hover:text-ink ${showPanel ? "text-ink" : "text-muted"}`}><SlidersHorizontal size={18} /></button>
                </>
              )}
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onPaste={onPasteImages} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder={type === "model" ? "Describe your model, or just say go…" : type === "carousel" ? "Give me the story arc, or just say go…" : type === "ad" ? "What are we selling — or just say go…" : isV2Type(type) ? "Describe the moment, or just say go…" : "Message your creative director…"}
                className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none" />
              <button onClick={send} disabled={thinking || busy || (type === "product" && !input.trim() && !products.length)} title={type === "product" && !input.trim() && products.length ? "Generate" : "Send"} className="rounded-full bg-ink p-1.5 text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"><ArrowUp size={16} /></button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImgs(e.target.files, setProducts)} />
            <input ref={refFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImgs(e.target.files, setReferences)} />
            <input ref={modelRefFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setSource("reference"); addImgs(e.target.files, setModelRefs); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function modelLabel(k: string): string {
  const map: Record<string, string> = { gender: "gender", ageRange: "age", ethnicity: "heritage", skinTone: "skin", hairColor: "hair colour", hairStyle: "hair style", eyes: "eyes", bodyType: "body", vibe: "energy", expression: "expression" };
  return map[k] ?? k;
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

// The six free-placement compositions + four hierarchy scales, surfaced as pickable chips.
const LAYOUT_OPTS: { id: NonNullable<CopyTreatment["layout"]>; label: string }[] = [
  { id: "lower-third", label: "Lower" },
  { id: "editorial-top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "mega", label: "Mega" },
  { id: "split", label: "Split" },
  { id: "side-rail", label: "Rail" },
];
const SCALE_OPTS: { id: NonNullable<CopyTreatment["scale"]>; label: string }[] = [
  { id: "minimal", label: "S" }, { id: "standard", label: "M" }, { id: "impact", label: "L" }, { id: "hero", label: "XL" },
];

/**
 * TYPOGRAPHY BAR — per-run control over the text laid on a creative: which typeface, where
 * it sits (the 6 free-placement compositions), its scale, case, alignment and ink. Every
 * change merges into the run's `treatment`, which drives BOTH the live overlay and the
 * export bake. Touching position/ink pins the run so the auto per-shot placement steps back.
 * "Shuffle" rolls a fresh look — the creative-exploration shortcut.
 */
function TypographyBar({ treatment, brandFonts, onChange }: { treatment?: CopyTreatment; brandFonts: BrandFonts; onChange: (patch: Partial<CopyTreatment>) => void }) {
  const [open, setOpen] = useState(true);
  const t = treatment ?? {};
  const fontId = t.fontId ?? BRAND_FONT_ID;
  const activeFontName = fontId === BRAND_FONT_ID ? "Brand" : (FONT_CHOICES.find((c) => c.id === fontId)?.name ?? "Brand");

  const Chip = ({ active, onClick, title, children, style }: { active: boolean; onClick: () => void; title?: string; children: ReactNode; style?: CSSProperties }) => (
    <button data-no-pan title={title} onClick={onClick} style={style}
      className={`flex items-center rounded-full px-2.5 py-1 text-[11px] leading-none transition-colors ${active ? "bg-ink text-canvas" : "border border-hairline text-muted hover:border-ink hover:text-ink"}`}>
      {children}
    </button>
  );
  const Label = ({ children }: { children: ReactNode }) => <span className="text-[9px] uppercase tracking-[0.16em] text-muted/70">{children}</span>;

  const shuffle = () => {
    const pick = <X,>(a: readonly X[]): X => a[Math.floor(Math.random() * a.length)];
    onChange({
      fontId: pick([BRAND_FONT_ID, ...FONT_CHOICES.map((c) => c.id)]),
      layout: pick(LAYOUT_OPTS).id,
      scale: pick(SCALE_OPTS).id,
      case: pick(["sentence", "upper"] as const),
      align: pick(["left", "center", "right"] as const),
      pinned: true,
    });
  };

  return (
    <div data-no-pan className="mb-3 rounded-card border border-hairline bg-canvas/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink" title={open ? "Hide typography" : "Show typography"}>
          <Type size={13} /> Type
        </button>
        <span className="text-[11px] text-muted">· {activeFontName}</span>
        <button onClick={shuffle} title="Surprise me — new typeface, position & scale" className="ml-auto flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink">
          <Shuffle size={12} /> Shuffle
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          <div>
            <div className="mb-1"><Label>Typeface</Label></div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={fontId === BRAND_FONT_ID} onClick={() => onChange({ fontId: BRAND_FONT_ID })} title="Your brand's own type" style={{ fontFamily: brandFonts.display.cssStack }}>Brand</Chip>
              {FONT_CHOICES.map((c) => (
                <Chip key={c.id} active={fontId === c.id} onClick={() => onChange({ fontId: c.id })} title={c.vibe} style={{ fontFamily: `'${c.display.family}', ${c.display.category === "serif" || c.display.category === "display" ? "serif" : "sans-serif"}` }}>{c.name}</Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1"><Label>Position</Label></div>
            <div className="flex flex-wrap gap-1.5">
              {LAYOUT_OPTS.map((l) => (
                <Chip key={l.id} active={t.layout === l.id} onClick={() => onChange({ layout: l.id, pinned: true })}>{l.label}</Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5"><Label>Size</Label>
              {SCALE_OPTS.map((sc) => (
                <Chip key={sc.id} active={(t.scale ?? "standard") === sc.id} onClick={() => onChange({ scale: sc.id })} title={sc.id}>{sc.label}</Chip>
              ))}
            </div>
            <div className="flex items-center gap-1.5"><Label>Case</Label>
              <Chip active={t.case !== "upper"} onClick={() => onChange({ case: "sentence" })} title="Sentence case">Aa</Chip>
              <Chip active={t.case === "upper"} onClick={() => onChange({ case: "upper" })} title="Uppercase">AA</Chip>
            </div>
            <div className="flex items-center gap-1.5"><Label>Align</Label>
              <Chip active={(t.align ?? "left") === "left"} onClick={() => onChange({ align: "left" })} title="Left"><AlignLeft size={12} /></Chip>
              <Chip active={t.align === "center"} onClick={() => onChange({ align: "center" })} title="Center"><AlignCenter size={12} /></Chip>
              <Chip active={t.align === "right"} onClick={() => onChange({ align: "right" })} title="Right"><AlignRight size={12} /></Chip>
            </div>
            <div className="flex items-center gap-1.5"><Label>Ink</Label>
              <Chip active={(t.ink ?? "light") === "light"} onClick={() => onChange({ ink: "light", pinned: true })} title="Light type over the image">Light</Chip>
              <Chip active={t.ink === "dark"} onClick={() => onChange({ ink: "dark", pinned: true })} title="Dark type over the image">Dark</Chip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Live copy overlay — renders the SAME free-placement layout the export bakes, in CSS.
 * fontPct is a % of the frame WIDTH, so `cqw` (1% of the container's inline size) matches
 * the export's px-off-width scaling exactly — the parent box sets `container-type`.
 */
function CopyOverlay({ copy, aspect, placement, fonts }: { copy: CampaignCopy; aspect?: number; placement?: ShotPlacement; fonts?: BrandFonts }) {
  // A user-pinned treatment governs positioning; otherwise the image-aware per-shot
  // placement (layout/anchor/ink) rides OVER the run treatment's voice.
  const treatment = !copy.treatment?.pinned && placement && Object.keys(placement).length ? { ...copy.treatment, ...placement } : copy.treatment;
  const spec = buildCopyLayout({ copy, treatment, aspect });
  if (!spec) return null;
  const subInk = spec.ink === "#ffffff" ? "rgba(255,255,255,0.92)" : "rgba(20,20,20,0.9)";
  const shadow = spec.ink === "#ffffff" ? "0 1px 14px rgba(0,0,0,0.38)" : "0 1px 12px rgba(255,255,255,0.42)";
  const blockStyle = (b: LayoutBlock, first: boolean): CSSProperties => {
    const base: CSSProperties = {
      marginTop: first ? 0 : `${b.role === "cta" ? 2.8 : 1.1}cqw`,
      fontSize: `${b.fontPct}cqw`,
      fontWeight: b.weight,
      letterSpacing: `${b.tracking}em`,
      lineHeight: b.lineHeight,
      textTransform: b.transform === "upper" ? "uppercase" : b.transform === "lower" ? "lowercase" : "none",
    };
    if (b.role === "cta") {
      const pad: CSSProperties = { paddingLeft: "2cqw", paddingRight: "2cqw", paddingTop: "0.9cqw", paddingBottom: "0.9cqw" };
      if (b.pill) return { ...base, ...pad, background: spec.pillBg, color: spec.pillInk, borderRadius: 999, fontFamily: "var(--brand-text)" };
      if (b.outline) return { ...base, ...pad, color: spec.ink, border: `0.22cqw solid ${spec.ink}`, borderRadius: 999, fontFamily: "var(--brand-text)" };
      return { ...base, color: spec.ink, textDecoration: b.underline ? "underline" : "none", textShadow: shadow, fontFamily: "var(--brand-text)" };
    }
    return { ...base, fontFamily: b.family === "display" ? "var(--brand-display)" : "var(--brand-text)", color: b.family === "display" ? spec.ink : subInk, textShadow: shadow, width: "100%", overflowWrap: "break-word" };
  };
  const clusterStyle = (c: LayoutCluster): CSSProperties => {
    const style: CSSProperties = {
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      alignItems: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start",
      textAlign: c.align,
      // Explicit width (matches the export) so wrapped headlines lay out identically.
      width: `${c.maxW * 100}%`,
    };
    if (c.ax === "left") style.left = `${c.x * 100}%`;
    else if (c.ax === "right") style.right = `${(1 - c.x) * 100}%`;
    else style.left = `${c.x * 100}%`;
    if (c.ay === "top") style.top = `${c.y * 100}%`;
    else if (c.ay === "bottom") style.bottom = `${(1 - c.y) * 100}%`;
    else style.top = `${c.y * 100}%`;
    const tx = c.ax === "center" ? "-50%" : "0";
    const ty = c.ay === "center" ? "-50%" : "0";
    if (tx !== "0" || ty !== "0") style.transform = `translate(${tx}, ${ty})`;
    return style;
  };
  // The chosen typeface is applied by overriding the brand-font CSS vars the blocks read,
  // so switching fonts restyles every block without touching the layout math.
  const rootStyle: CSSProperties = { backgroundImage: spec.scrim };
  if (fonts) {
    (rootStyle as Record<string, string>)["--brand-display"] = fonts.display.cssStack;
    (rootStyle as Record<string, string>)["--brand-text"] = fonts.text.cssStack;
  }
  return (
    <div className="pointer-events-none absolute inset-0" style={rootStyle}>
      {spec.clusters.map((c, ci) => (
        <div key={ci} style={clusterStyle(c)}>
          {c.blocks.map((b, i) => (
            <div key={i} style={blockStyle(b, i === 0)}>{b.arrow ? `${b.text} →` : b.text}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

type ShotCardProps = {
  s: Shot;
  type: CreativeType;
  enhanceOn: boolean;
  copy?: CampaignCopy; // overlay copy — DATA on top of the image; baked in only on export
  brandFonts: BrandFonts;
  overlayFonts: BrandFonts; // the run's chosen typeface (Typography bar) — brand pair by default
  onSave: (s: Shot, copy?: CampaignCopy) => void;
  editing: { id: string; text: string } | null;
  setEditing: (e: { id: string; text: string } | null) => void;
  adapting: string | null;
  setAdapting: (id: string | null) => void;
  onDecide: (s: Shot, d: Decision) => void;
  onReshoot: (s: Shot) => void;
  onApplyChange: (s: Shot, t: string) => void;
  onUpscale: (s: Shot) => void;
  onEnhance: (s: Shot, a: "cutout" | "relight") => void;
  onAdapt: (s: Shot, f: FormatId) => void;
};

function ShotCard({ s, type, enhanceOn, copy, brandFonts, overlayFonts, onSave, editing, setEditing, adapting, setAdapting, onDecide, onReshoot, onApplyChange, onUpscale, onEnhance, onAdapt }: ShotCardProps) {
  const formatBadge = s.format ? FORMATS[s.format as FormatId]?.label ?? s.format : undefined;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.985, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="group overflow-hidden rounded-card bg-canvas transition-shadow duration-200 ease-brand hover:shadow-card">
      <div className="relative w-full overflow-hidden bg-surface" style={{ aspectRatio: String(s.aspect ?? 4 / 5), containerType: "inline-size" }}>
        {s.url ? (
          <>
            <img src={displaySrc(s.url)} alt={s.angle} loading="lazy" decoding="async" className={`h-full w-full object-cover transition-opacity duration-200 ${s.pending ? "opacity-40" : s.decision === "reject" ? "opacity-45" : ""}`} />
            {/* copy overlay — real brand typography staged by the shared free-placement layout.
               This is a live preview of EXACTLY what "Save" bakes into the exported PNG. */}
            {(copy?.headline || copy?.cta) && !s.pending && <CopyOverlay copy={copy} aspect={s.aspect} placement={s.placement} fonts={overlayFonts} />}
            {s.pending && <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink" /></div>}
            {s.hires && !s.pending && <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] text-canvas">4K</span>}
            {s.decision === "hero" && !s.pending && <span className="absolute right-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[10px] text-canvas">Hero</span>}
            {s.decision === "keep" && !s.pending && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ink" title="Kept" />}
            {s.decision === "reject" && !s.pending && <span className="absolute left-2 bottom-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-canvas">rejected</span>}
            {s.drift && !s.pending && <span title={(s.driftReasons ?? []).join("; ") || "This edit may have drifted off-brand"} className="absolute right-2 bottom-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-canvas">check brand</span>}
          </>
        ) : s.failed ? (
          <button onClick={() => onReshoot(s)} className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted transition-colors hover:text-ink"><RefreshCw size={18} /><span className="text-xs">failed · retry</span></button>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="absolute inset-0 animate-pulse bg-hairline/40" />
            <Loader2 size={18} className="relative animate-spin text-muted" />
          </div>
        )}
        {/* frame order / placement — hairline chips, always visible so the set reads at a glance */}
        {typeof s.seq === "number" && !s.hires && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-hairline bg-canvas/90 text-[10px] tabular-nums text-ink">{s.seq}</span>}
        {formatBadge && typeof s.seq !== "number" && !s.hires && <span className="absolute left-2 top-2 rounded-full border border-hairline bg-canvas/90 px-2 py-0.5 text-[10px] text-ink">{formatBadge}</span>}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        {type === "model" && s.angle && <div className="mb-1 truncate text-[11px] text-muted" title={s.angle}>{s.angle}</div>}
        {(type === "carousel" || type === "ad") && s.angle && <div className="mb-1 truncate text-[11px] text-muted" title={s.angle}>{s.angle}</div>}
        {s.url && !s.pending && (
          // Always visible (no hover) — touch devices have no hover, so the actions must show.
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
            <button onClick={() => onDecide(s, "keep")} className={s.decision === "keep" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Keep — teach the brand this worked">Keep</button>
            <button onClick={() => onDecide(s, "hero")} className={s.decision === "hero" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Hero — the standout of the set">Hero</button>
            <button onClick={() => onDecide(s, "reject")} className={s.decision === "reject" ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Reject — steer future shoots away from this">Reject</button>
            <span className="h-3 w-px bg-hairline" />
            <button onClick={() => setEditing({ id: s.id, text: "" })} className="text-muted transition-colors hover:text-ink">Change</button>
            <button onClick={() => onReshoot(s)} className="text-muted transition-colors hover:text-ink">Redo</button>
            <button onClick={() => setAdapting(adapting === s.id ? null : s.id)} className={adapting === s.id ? "text-ink" : "text-muted transition-colors hover:text-ink"} title="Adapt this exact image to another placement — crop or extend, never re-rendered">Adapt</button>
            <button onClick={() => onUpscale(s)} className="flex items-center gap-1 text-muted transition-colors hover:text-ink"><Sparkles size={12} />4K</button>
            {enhanceOn && <button onClick={() => onEnhance(s, "cutout")} className="text-muted transition-colors hover:text-ink">Cutout</button>}
            {enhanceOn && <button onClick={() => onEnhance(s, "relight")} className="text-muted transition-colors hover:text-ink">Relight</button>}
            <span className="ml-auto flex items-center gap-2">
              {(copy?.headline || copy?.cta) && (
                <button onClick={() => onSave(s, undefined)} className="text-muted/70 transition-colors hover:text-ink" title="Save the clean plate — no text">plain</button>
              )}
              <button onClick={() => onSave(s, copy)} className="flex items-center gap-1 text-muted transition-colors hover:text-ink" title={copy?.headline || copy?.cta ? "Save with the copy baked in, in your brand type" : "Save this image"}>
                {s.saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}{copy?.headline || copy?.cta ? "Save w/ text" : "Save"}
              </button>
            </span>
          </div>
        )}
        {adapting === s.id && s.url && !s.pending && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FORMAT_IDS.map((f) => (
              <button key={f} onClick={() => onAdapt(s, f)} className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink">
                {FORMATS[f].label}
              </button>
            ))}
          </div>
        )}
        {editing?.id === s.id && (
          <div className="mt-2 flex gap-2">
            <input autoFocus value={editing.text} onChange={(e) => setEditing({ id: s.id, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onApplyChange(s, editing.text)} placeholder={type === "model" ? "What to change — e.g. softer light, looking away, hair down" : "What to change — e.g. warmer light, on marble"} className="flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm focus:border-ink" />
            <button onClick={() => onApplyChange(s, editing.text)} className="rounded-md bg-ink px-3 py-1.5 text-xs text-canvas">Apply</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
