"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";

export default function BrandStudio() {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [valid, setValid] = useState(true);

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((p) => { setText(JSON.stringify(p, null, 2)); setName(p.name ?? ""); setStatus("Loaded"); })
      .catch(() => setStatus("Failed to load"));
  }, []);

  function onChange(v: string) {
    setText(v);
    try { JSON.parse(v); setValid(true); } catch { setValid(false); }
  }

  async function save() {
    try {
      const obj = JSON.parse(text);
      const r = await fetch("/api/brand", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setName(obj.name ?? ""); setStatus("Saved ✓");
    } catch (e) { setStatus(`Error: ${(e as Error).message}`); }
  }

  return (
    <Shell active="brand" right={name}>
      <div className="mx-auto max-w-content px-8 py-10">
        <div className="mb-1 text-xs uppercase tracking-[0.12em] text-muted">Internal</div>
        <h1 className="text-2xl font-semibold tracking-display">Brand Studio</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          The machine-readable Brand Profile that locks every generation — palette, type, the visual rulebook, and the do-not list. Edit and save.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={save} disabled={!valid} className="rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-opacity duration-200 ease-brand hover:opacity-90 disabled:opacity-40">
            Save profile
          </button>
          <span className={`text-sm ${valid ? "text-muted" : "text-ink"}`}>{valid ? status : "Invalid JSON"}</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="mt-5 h-[60vh] w-full resize-none rounded-card border border-hairline bg-surface p-5 font-mono text-[13px] leading-relaxed focus:border-ink"
        />
      </div>
    </Shell>
  );
}
