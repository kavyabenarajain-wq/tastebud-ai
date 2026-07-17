"use client";

import { useRef, useState } from "react";
import { MousePointer2, Hand, Pencil, Eraser, ArrowUpRight, Type, StickyNote, Image as ImageIcon, Square, ChevronRight } from "lucide-react";

/**
 * Floating Canvas Toolbar + annotation layer for the Asset Studio canvas.
 *
 *   Toolbar Container (dark pill) → Tool Buttons → Divider → Collapse Toggle
 *   Variants: Expanded | Collapsed     States: Default · Hover · Active · Disabled
 *
 * Follows the app's monochrome non-negotiable (CLAUDE.md): the container is ink, the
 * ACTIVE tool is a white chip (not the green from the reference) so the UI keeps no
 * chromatic accent. Annotations live in an SVG that sits inside the canvas' transformed
 * content, so they pan and zoom locked to the work.
 */

export type CanvasTool = "select" | "pan" | "draw" | "shape" | "arrow" | "text" | "sticky" | "eraser" | "image";

/** Tools that draw on the overlay (vs. navigate the canvas). Pan is handled by the page. */
export const DRAW_TOOLS: CanvasTool[] = ["draw", "shape", "arrow", "text", "sticky", "eraser"];
export const isDrawTool = (t: CanvasTool) => DRAW_TOOLS.includes(t);

const TOOLS: { id: CanvasTool; label: string; Icon: typeof MousePointer2; group: "nav" | "make" }[] = [
  { id: "select", label: "Select", Icon: MousePointer2, group: "nav" },
  { id: "pan", label: "Pan", Icon: Hand, group: "nav" },
  { id: "draw", label: "Draw", Icon: Pencil, group: "make" },
  { id: "shape", label: "Rectangle", Icon: Square, group: "make" },
  { id: "arrow", label: "Arrow", Icon: ArrowUpRight, group: "make" },
  { id: "text", label: "Text", Icon: Type, group: "make" },
  { id: "sticky", label: "Sticky note", Icon: StickyNote, group: "make" },
  { id: "image", label: "Insert image", Icon: ImageIcon, group: "make" },
  { id: "eraser", label: "Eraser", Icon: Eraser, group: "make" },
];

export function CanvasToolbar({
  tool,
  onTool,
  onInsertImage,
  disabled,
}: {
  tool: CanvasTool;
  onTool: (t: CanvasTool) => void;
  onInsertImage: () => void;
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const shown = collapsed ? TOOLS.filter((t) => t.id === tool) : TOOLS;

  const btn = (t: (typeof TOOLS)[number]) => {
    const active = tool === t.id;
    return (
      <button
        key={t.id}
        data-no-pan
        disabled={disabled}
        title={t.label}
        aria-label={t.label}
        aria-pressed={active}
        onClick={() => (t.id === "image" ? onInsertImage() : onTool(t.id))}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
          active ? "bg-canvas text-ink" : "text-canvas/60 hover:bg-canvas/10 hover:text-canvas"
        }`}
      >
        <t.Icon size={16} strokeWidth={1.75} />
      </button>
    );
  };

  return (
    <div
      data-no-pan
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-white/10 bg-ink/95 px-1.5 py-1.5 shadow-card backdrop-blur"
    >
      {shown.filter((t) => t.group === "nav").map(btn)}
      {!collapsed && <span className="mx-1 h-5 w-px bg-canvas/15" />}
      {shown.filter((t) => t.group === "make").map(btn)}
      <span className="mx-1 h-5 w-px bg-canvas/15" />
      <button
        data-no-pan
        title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
        aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-canvas/60 transition-colors duration-150 hover:bg-canvas/10 hover:text-canvas"
      >
        <ChevronRight size={16} strokeWidth={1.75} className={`transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}

// ── Annotation overlay ──────────────────────────────────────────────────────

export type Anno =
  | { id: string; kind: "path"; pts: [number, number][] }
  | { id: string; kind: "rect"; x: number; y: number; w: number; h: number }
  | { id: string; kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "text"; x: number; y: number; text: string }
  | { id: string; kind: "sticky"; x: number; y: number; text: string };

const INK = "#1D1D1F";
const uid = (seq: number) => `a${seq}-${seq * 2654435761 % 100000}`;

/**
 * SVG overlay placed INSIDE the canvas content transform (so it pans/zooms with the
 * work). Captures pointer events only while a draw tool is active; otherwise it is
 * transparent to clicks so cards stay interactive and the canvas pans.
 *
 * CONTROLLED: the committed annotations live in the page so they share the canvas'
 * undo/redo history (draw → undo removes it). Only the in-progress `draft` is local.
 * Every finished mark / erase goes through `onCommit`, which snapshots history.
 */
export function AnnotationLayer({ tool, annos, onCommit }: { tool: CanvasTool; annos: Anno[]; onCommit: (next: Anno[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Anno | null>(null);
  const seq = useRef(0);
  const drawing = useRef(false);
  const nextId = () => uid(++seq.current);

  const active = isDrawTool(tool);

  // client (screen) point → the SVG's own coordinate space, robust to pan + zoom.
  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const loc = pt.matrixTransform(m.inverse());
    return [loc.x, loc.y];
  };

  function onDown(e: React.PointerEvent) {
    if (!active) return;
    e.stopPropagation();
    const [x, y] = toLocal(e.clientX, e.clientY);
    if (tool === "text" || tool === "sticky") {
      const text = window.prompt(tool === "sticky" ? "Sticky note" : "Text")?.trim();
      if (text) onCommit([...annos, { id: nextId(), kind: tool, x, y, text }]);
      return;
    }
    drawing.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    if (tool === "draw") setDraft({ id: nextId(), kind: "path", pts: [[x, y]] });
    else if (tool === "shape") setDraft({ id: nextId(), kind: "rect", x, y, w: 0, h: 0 });
    else if (tool === "arrow") setDraft({ id: nextId(), kind: "arrow", x1: x, y1: y, x2: x, y2: y });
  }

  function onMove(e: React.PointerEvent) {
    if (!active || !drawing.current || !draft) return;
    e.stopPropagation();
    const [x, y] = toLocal(e.clientX, e.clientY);
    if (draft.kind === "path") setDraft({ ...draft, pts: [...draft.pts, [x, y]] });
    else if (draft.kind === "rect") setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    else if (draft.kind === "arrow") setDraft({ ...draft, x2: x, y2: y });
  }

  function onUp(e: React.PointerEvent) {
    if (!drawing.current) return;
    drawing.current = false;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (draft) {
      const big =
        (draft.kind === "path" && draft.pts.length > 1) ||
        (draft.kind === "rect" && (Math.abs(draft.w) > 4 || Math.abs(draft.h) > 4)) ||
        (draft.kind === "arrow" && (Math.abs(draft.x2 - draft.x1) > 4 || Math.abs(draft.y2 - draft.y1) > 4));
      if (big) onCommit([...annos, draft]);
    }
    setDraft(null);
  }

  const erase = (id: string) => tool === "eraser" && onCommit(annos.filter((x) => x.id !== id));
  const render = (a: Anno) => {
    const eraseProps = tool === "eraser" ? { onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); erase(a.id); }, style: { cursor: "pointer" as const } } : {};
    switch (a.kind) {
      case "path":
        return <polyline key={a.id} points={a.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...eraseProps} />;
      case "rect":
        return <rect key={a.id} x={Math.min(a.x, a.x + a.w)} y={Math.min(a.y, a.y + a.h)} width={Math.abs(a.w)} height={Math.abs(a.h)} fill="none" stroke={INK} strokeWidth={3} rx={6} {...eraseProps} />;
      case "arrow":
        return <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={INK} strokeWidth={3} markerEnd="url(#anno-arrow)" strokeLinecap="round" {...eraseProps} />;
      case "text":
        return <text key={a.id} x={a.x} y={a.y} fill={INK} fontSize={20} fontWeight={600} style={{ fontFamily: "var(--brand-display)" }} {...eraseProps}>{a.text}</text>;
      case "sticky":
        return (
          <g key={a.id} {...eraseProps}>
            <rect x={a.x} y={a.y} width={160} height={120} rx={4} fill="#F5F5F7" stroke="rgba(0,0,0,0.08)" />
            <foreignObject x={a.x + 10} y={a.y + 8} width={140} height={104}>
              <div style={{ fontFamily: "var(--brand-text)", fontSize: 13, lineHeight: 1.35, color: INK, overflow: "hidden" }}>{a.text}</div>
            </foreignObject>
          </g>
        );
    }
  };

  return (
    <svg
      ref={svgRef}
      data-no-pan={active ? "" : undefined}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: active ? "auto" : "none", cursor: tool === "eraser" ? "cell" : active ? "crosshair" : "default", touchAction: active ? "none" : undefined, zIndex: 5 }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <defs>
        <marker id="anno-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={INK} />
        </marker>
      </defs>
      {annos.map(render)}
      {draft && render(draft)}
    </svg>
  );
}
