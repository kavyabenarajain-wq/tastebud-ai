"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, ChevronDown, Undo2, Redo2, Trash2, Copy, MoreVertical } from "lucide-react";

/**
 * Floating canvas top bar (white). Figma-style chrome for the Asset Studio canvas:
 *   ☰ menu · Page/board name ⌄ · undo · redo · trash · duplicate · ⋮ more
 * Light theme per the app's monochrome system — ink icons on a white pill.
 */

export interface MenuItem { label: string; onClick: () => void; danger?: boolean }

export function CanvasTopBar({
  boardName,
  onRename,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDuplicate,
  onTrash,
  canDuplicate = true,
  canTrash = true,
  menuItems,
  moreItems,
}: {
  boardName: string;
  onRename: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  canDuplicate?: boolean; // a set exists to duplicate — else the button greys out instead of silently no-op'ing
  canTrash?: boolean;     // a set exists to delete
  menuItems: MenuItem[];
  moreItems: MenuItem[];
}) {
  const [open, setOpen] = useState<null | "menu" | "more">(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(boardName);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(boardName), [boardName]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:text-hairline disabled:hover:bg-transparent";
  const commitRename = () => { const v = draft.trim(); if (v && v !== boardName) onRename(v); setRenaming(false); };

  const Dropdown = ({ items }: { items: MenuItem[] }) => (
    <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-hairline bg-canvas py-1 shadow-card">
      {items.map((it) => (
        <button
          key={it.label}
          data-no-pan
          onClick={() => { it.onClick(); setOpen(null); }}
          className={`flex w-full items-center px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-surface ${it.danger ? "text-[#c0392b]" : "text-ink"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={wrap} data-no-pan className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-hairline bg-canvas/95 px-1.5 py-1.5 shadow-card backdrop-blur">
      {/* ☰ menu */}
      <div className="relative">
        <button className={iconBtn} title="Menu" aria-label="Menu" onClick={() => setOpen(open === "menu" ? null : "menu")}><Menu size={16} strokeWidth={1.75} /></button>
        {open === "menu" && <Dropdown items={menuItems} />}
      </div>

      {/* board / page name */}
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setDraft(boardName); setRenaming(false); } }}
          className="mx-1 w-28 rounded-md border border-hairline bg-canvas px-2 py-1 text-[13px] text-ink focus:border-ink"
        />
      ) : (
        <button className="mx-0.5 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface" title="Rename board" onClick={() => setRenaming(true)}>
          {boardName} <ChevronDown size={13} strokeWidth={2} className="text-muted" />
        </button>
      )}

      <span className="mx-1 h-5 w-px bg-hairline" />

      <button className={iconBtn} title="Undo" aria-label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} strokeWidth={1.75} /></button>
      <button className={iconBtn} title="Redo" aria-label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} strokeWidth={1.75} /></button>

      <span className="mx-1 h-5 w-px bg-hairline" />

      <button className={iconBtn} title={canDuplicate ? "Duplicate selected set" : "Nothing to duplicate yet"} aria-label="Duplicate" disabled={!canDuplicate} onClick={onDuplicate}><Copy size={16} strokeWidth={1.75} /></button>
      <button className={iconBtn} title={canTrash ? "Delete selected set" : "Nothing to delete yet"} aria-label="Delete" disabled={!canTrash} onClick={onTrash}><Trash2 size={16} strokeWidth={1.75} /></button>

      <span className="mx-1 h-5 w-px bg-hairline" />

      <div className="relative">
        <button className={iconBtn} title="More" aria-label="More" onClick={() => setOpen(open === "more" ? null : "more")}><MoreVertical size={16} strokeWidth={1.75} /></button>
        {open === "more" && (
          <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-hairline bg-canvas py-1 shadow-card">
            {moreItems.map((it) => (
              <button key={it.label} data-no-pan onClick={() => { it.onClick(); setOpen(null); }} className={`flex w-full items-center px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-surface ${it.danger ? "text-[#c0392b]" : "text-ink"}`}>{it.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
