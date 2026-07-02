"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";
import type { BrandBrain } from "@/lib/types";

/**
 * INTERNAL TOOL (operator-only) — Brand Guidelines / Deck Builder.
 * A list of brand folders (each Discovery booking is one), paste call notes, generate
 * a full guidelines deck, and persist it back to the SAME per-brand brain the Studio
 * reads — so a discovered brand can be loaded straight into Asset Studio to shoot.
 */

type Spec = { brandName?: string; tagline?: string };
type Research = { competitors?: string[]; sources?: number };
type BrainMeta = { slug: string; name: string; origin: string; updatedAt: string; hasResearch: boolean; hasGuidelines: boolean };

const STEPS = ["Reading the founder", "Researching the sector", "Designing the identity", "Building the slides"];

export default function InternalDeckTool() {
  const router = useRouter();
  const [brains, setBrains] = useState<BrainMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [exBranding, setExBranding] = useState(""); // existing brand doc for a rebrand — evolve FROM it
  const [referenceNotes, setReferenceNotes] = useState(""); // pasted refs: hex codes, font names, links
  const [references, setReferences] = useState<string[]>([]); // uploaded reference images (data URLs): logo/palette/type
  const refFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null); // upload a notes / brand document (read as text)
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pptx, setPptx] = useState("");
  const [spec, setSpec] = useState<Spec | null>(null);
  const [research, setResearch] = useState<Research | null>(null);

  async function refreshList() {
    try {
      const r = await fetch("/api/brains");
      const j = await r.json();
      setBrains(j.brains ?? []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refreshList();
  }, []);

  async function selectFolder(slug: string) {
    setSelected(slug);
    setPptx("");
    setSpec(null);
    setError("");
    try {
      const r = await fetch(`/api/brains/${slug}`);
      const j = await r.json();
      if (j.brain?.name) setName(j.brain.name);
    } catch {
      /* ignore */
    }
  }

  function newFolder() {
    setSelected(null);
    setName("");
    setNotes("");
    setExBranding("");
    setPptx("");
    setSpec(null);
    setError("");
  }

  async function openInStudio(slug: string) {
    try {
      const r = await fetch(`/api/brains/${slug}`);
      const j = await r.json();
      const brain = j.brain as BrandBrain;
      if (brain?.name) {
        localStorage.setItem("cc.activeBrand", JSON.stringify(brain));
        router.push("/studio/create");
      }
    } catch {
      /* ignore */
    }
  }

  async function build() {
    setBusy(true);
    setError("");
    setPptx("");
    setSpec(null);
    setResearch(null);
    let i = 0;
    setStatus(STEPS[0]);
    const tick = setInterval(() => {
      i = Math.min(i + 1, STEPS.length - 1);
      setStatus(STEPS[i]);
    }, 9000);
    try {
      const r = await fetch("/api/backbrain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes, name, slug: selected ?? undefined, exBranding: exBranding.trim() || undefined, referenceNotes: referenceNotes.trim() || undefined, references }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Failed");
      setPptx(j.pptx);
      setSpec(j.spec);
      setResearch(j.research);
      setStatus("Deck ready ✓ — saved to the brand’s folder");
      refreshList();
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  function addRefs(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      if (!f.type.startsWith("image/")) continue;
      const rd = new FileReader();
      rd.onload = () => setReferences((cur) => (cur.length >= 6 ? cur : [...cur, String(rd.result)]));
      rd.readAsDataURL(f);
    }
  }

  // Upload a document (notes / brief / brand book) — read text files straight into the notes.
  function addDoc(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setNotes((cur) => (cur.trim() ? cur + "\n\n" : "") + String(rd.result));
    rd.readAsText(f);
  }

  function download() {
    if (!pptx) return;
    const bin = atob(pptx);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(spec?.brandName || name || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-guidelines.pptx`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
        <div className="flex items-center gap-4">
          <BackLink href="/choose" />
          <Wordmark size="sm" href="/" />
          <span className="rounded-full border border-hairline px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">Internal</span>
        </div>
        <span className="text-[13px] text-muted">Brand guidelines · deck builder</span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_400px_1fr]">
        {/* Brand folders */}
        <aside className="border-r border-hairline px-4 py-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted">Brands</span>
            <button onClick={newFolder} className="text-[13px] text-ink hover:opacity-60">+ New</button>
          </div>
          <div className="space-y-1">
            {brains.length === 0 && <p className="text-[13px] leading-relaxed text-muted">No brand folders yet. Bookings and Studio brands appear here.</p>}
            {brains.map((b) => (
              <button
                key={b.slug}
                onClick={() => selectFolder(b.slug)}
                className={`w-full rounded-control px-3 py-2 text-left transition-colors ${selected === b.slug ? "bg-surface" : "hover:bg-surface"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm text-ink">{b.name}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">{b.origin}</span>
                </div>
                <div className="mt-0.5 flex gap-2 text-[10px] text-muted">
                  {b.hasResearch && <span>researched</span>}
                  {b.hasGuidelines && <span>· deck ✓</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Intake */}
        <div className="border-r border-hairline px-7 py-8">
          <h1 className="font-serif text-2xl font-light tracking-tight text-ink">{selected ? "Build the deck" : "New brand"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Paste the 30-min call notes and the founder’s answers. It reads them, researches the sector, designs the
            identity, and builds an editable guidelines deck — saved to the brand’s folder.
          </p>

          <label className="mt-7 block text-[11px] font-medium uppercase tracking-wide text-muted">Brand name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Willow"
            className="mt-2 w-full rounded-control border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
          />

          <div className="mt-5 flex items-center justify-between">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">Call notes + answers</label>
            <button onClick={() => docFileRef.current?.click()} className="text-[11px] text-ink transition-opacity hover:opacity-60">＋ upload document</button>
          </div>
          <input ref={docFileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.rtf,.text,text/*" hidden onChange={(e) => addDoc(e.target.files)} />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste everything you learned — what they sell, who it’s for, why they started, any colours/fonts, the feeling they want…"
            rows={15}
            className="mt-2 w-full resize-y rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ink"
          />

          <label className="mt-5 block text-[11px] font-medium uppercase tracking-wide text-muted">Existing branding · optional (for a rebrand)</label>
          <textarea
            value={exBranding}
            onChange={(e) => setExBranding(e.target.value)}
            placeholder="Rebrand? Paste their CURRENT brand book / guidelines — logo notes, colours, fonts, tone of voice. We treat it as the starting point and evolve FROM it, keeping only the equity worth carrying — not a copy."
            rows={7}
            className="mt-2 w-full resize-y rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ink"
          />

          <label className="mt-5 block text-[11px] font-medium uppercase tracking-wide text-muted">References · optional — logo / fonts / typography / palette</label>
          <textarea
            value={referenceNotes}
            onChange={(e) => setReferenceNotes(e.target.value)}
            placeholder="Any references the client HAS for the new identity — paste hex codes (#0A2540…), font names (e.g. Söhne, Canela), links, or a direction. We read these + the images below and co-create the deck AROUND them."
            rows={4}
            className="mt-2 w-full resize-y rounded-control border border-hairline bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ink"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => refFileRef.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-hairline text-[11px] text-muted transition-colors hover:border-ink hover:text-ink">＋ image</button>
            {references.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-control border border-hairline">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setReferences((cur) => cur.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 px-1 text-[10px] leading-4 text-white group-hover:block">✕</button>
              </div>
            ))}
            <input ref={refFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addRefs(e.target.files)} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Drop the logo, colour swatches, or type samples they gave you. We read them (colours as hex, type & logo feel) and build the deck from them.</p>

          <button
            onClick={build}
            disabled={busy || (notes.trim().length < 40 && !exBranding.trim() && !referenceNotes.trim() && references.length === 0)}
            className="mt-5 w-full rounded-control bg-black px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-200 ease-brand hover:opacity-80 disabled:opacity-30"
          >
            {busy ? "Building…" : "Build the brand"}
          </button>

          {status && <div className="mt-3 text-sm text-muted">{busy ? "◇ " : ""}{status}</div>}
          {error && <div className="mt-3 text-sm text-[#b4453a]">{error}</div>}

          {research?.competitors?.length ? (
            <div className="mt-6 border-t border-hairline pt-4">
              <div className="text-[11px] uppercase tracking-wide text-muted">Sector reference{research.sources ? ` · ${research.sources} sources` : ""}</div>
              <div className="mt-2 text-sm text-ink">{research.competitors.join(" · ")}</div>
            </div>
          ) : null}
        </div>

        {/* Result */}
        <div className="px-7 py-8">
          <div className="text-[11px] uppercase tracking-wide text-muted">Deck</div>
          {pptx ? (
            <div className="mt-6 flex h-[72vh] flex-col items-center justify-center rounded-card border border-hairline bg-surface text-center">
              <div className="font-serif text-2xl font-light tracking-tight text-ink">{spec?.brandName} — Brand Guidelines</div>
              {spec?.tagline ? <div className="mt-1 max-w-md text-sm text-muted">{spec.tagline}</div> : null}
              <div className="mt-6 flex gap-3">
                <button onClick={download} className="rounded-control bg-black px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80">
                  Download .pptx
                </button>
                {selected && (
                  <button onClick={() => openInStudio(selected)} className="rounded-control border border-hairline px-6 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas">
                    Open in Studio →
                  </button>
                )}
              </div>
              <p className="mt-4 max-w-md text-xs text-muted">
                Saved to the brand’s folder. Opens in Keynote, PowerPoint or Google Slides — fully editable.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex h-[72vh] items-center justify-center rounded-card border border-dashed border-hairline text-sm text-muted">
              {busy ? "Building the deck…" : "The editable .pptx will appear here."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
