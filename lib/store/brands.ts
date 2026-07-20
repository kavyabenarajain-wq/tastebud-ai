import type { BrandBrain, BrandMemory, ShotMemory } from "../types";
import { one, all, run, batch, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";
import { logEvent } from "./customers";

/**
 * Brand store — the per-tenant brain + its learned memory, over libSQL (SQLite / Turso).
 *
 * Every function is async. Keyed by slug WITHIN an account (single default account until auth).
 * The stable `id` column decouples identity from the mutable name, and UNIQUE(account_id, slug)
 * means two different customers can each own a brand called "Nira" the day accounts land.
 */

export type BrainOrigin = "discovery" | "studio";

export interface BrainMeta {
  slug: string;
  name: string;
  origin: BrainOrigin;
  email?: string;
  createdAt: string;
  updatedAt: string;
  hasResearch: boolean;
  hasGuidelines: boolean;
}

export function slugify(name: string): string {
  return (name || "brand")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "brand";
}

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  brain_json: string;
  guidelines_json: string | null;
  origin: string | null;
  email: string | null;
  has_research: number;
  has_guidelines: number;
  created_at: string;
  updated_at: string;
}

function safeParse<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function rowToMeta(r: BrandRow): BrainMeta {
  return {
    slug: r.slug,
    name: r.name,
    origin: (r.origin as BrainOrigin) ?? "studio",
    email: r.email ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasResearch: !!r.has_research,
    hasGuidelines: !!r.has_guidelines,
  };
}

/** List every brand for an account, newest-updated first. */
export async function listBrains(account = DEFAULT_ACCOUNT): Promise<BrainMeta[]> {
  const rows = await all<BrandRow>("SELECT * FROM brands WHERE account_id = ? ORDER BY updated_at DESC", [account]);
  return rows.map(rowToMeta);
}

export async function getBrain(slug: string, account = DEFAULT_ACCOUNT): Promise<BrandBrain | null> {
  const row = await one<{ brain_json?: string }>("SELECT brain_json FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  return safeParse<BrandBrain>(row?.brain_json);
}

export async function getMeta(slug: string, account = DEFAULT_ACCOUNT): Promise<BrainMeta | null> {
  const row = await one<BrandRow>("SELECT * FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  return row ? rowToMeta(row) : null;
}

/**
 * Create or update a brand. Saving the same brand again MERGES in place (research / guidelines
 * accumulate, never wiped by a lighter later save). A concurrent read-modify-write is no longer
 * wrapped in one transaction, but there is one writer per brand in practice.
 */
export async function saveBrain(
  brain: BrandBrain,
  opts: { origin?: BrainOrigin; email?: string; account?: string } = {}
): Promise<BrainMeta> {
  const account = opts.account ?? DEFAULT_ACCOUNT;
  const slug = slugify(brain.name || "brand");
  const prev = await one<BrandRow>("SELECT * FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  const prevBrain = prev ? safeParse<BrandBrain>(prev.brain_json) : null;
  // Merge so a later, lighter save never wipes earlier research.
  const merged: BrandBrain = { ...(prevBrain ?? {}), ...brain };
  if (prevBrain?.research && !brain.research) merged.research = prevBrain.research;

  const ts = nowISO();
  const name = brain.name || prev?.name || "Brand";
  const origin: BrainOrigin = opts.origin ?? (prev?.origin as BrainOrigin) ?? "studio";
  const email = opts.email ?? prev?.email ?? null;
  const hasResearch = merged.research ? 1 : 0;
  const hasGuidelines = prev?.has_guidelines ?? 0;

  if (prev) {
    await run("UPDATE brands SET name = ?, brain_json = ?, origin = ?, email = ?, has_research = ?, updated_at = ? WHERE id = ?",
      [name, JSON.stringify(merged), origin, email, hasResearch, ts, prev.id]);
    return { slug, name, origin, email: email ?? undefined, createdAt: prev.created_at, updatedAt: ts, hasResearch: !!hasResearch, hasGuidelines: !!hasGuidelines };
  }
  const id = genId("brd");
  await run(
    "INSERT INTO brands (id, account_id, slug, name, brain_json, origin, email, has_research, has_guidelines, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, account, slug, name, JSON.stringify(merged), origin, email, hasResearch, 0, ts, ts]
  );
  // Activity timeline: which brand this account is building. Non-blocking — never fails the save.
  await logEvent(account, "brand_created", name).catch(() => {});
  return { slug, name, origin, email: email ?? undefined, createdAt: ts, updatedAt: ts, hasResearch: !!hasResearch, hasGuidelines: false };
}

const MEMORY_CAP = 24;

/**
 * Record one shot decision into the brand's learned memory (the "sharper every campaign" loop).
 * Read-modify-write of the brain blob — de-dupes by shot id, moves an id between approve/reject/hero
 * when re-decided, caps each list. Null if the brand is gone.
 */
export async function recordShotDecision(slug: string, entry: ShotMemory, account = DEFAULT_ACCOUNT): Promise<BrandMemory | null> {
  const row = await one<{ id: string; brain_json: string }>("SELECT id, brain_json FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  if (!row) return null;
  const brain = safeParse<BrandBrain>(row.brain_json) ?? ({} as BrandBrain);
  const mem: BrandMemory = brain.memory ?? { approvedShots: [], rejectedShots: [], heroShots: [] };
  const strip = (list?: ShotMemory[]) => (list ?? []).filter((s) => s.id !== entry.id);
  mem.approvedShots = strip(mem.approvedShots);
  mem.rejectedShots = strip(mem.rejectedShots);
  mem.heroShots = strip(mem.heroShots);

  const target =
    entry.decision === "reject" ? mem.rejectedShots
    : entry.decision === "hero" ? mem.heroShots
    : mem.approvedShots;
  target!.unshift(entry);

  mem.approvedShots = mem.approvedShots.slice(0, MEMORY_CAP);
  mem.rejectedShots = mem.rejectedShots.slice(0, MEMORY_CAP);
  mem.heroShots = (mem.heroShots ?? []).slice(0, MEMORY_CAP);
  mem.updatedAt = nowISO();
  brain.memory = mem;

  await run("UPDATE brands SET brain_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(brain), mem.updatedAt, row.id]);
  return mem;
}

/** Pre-create an empty brand from a Discovery booking. */
export async function createDiscoveryBrain(name: string, email?: string): Promise<BrainMeta> {
  return saveBrain({ name } as BrandBrain, { origin: "discovery", email });
}

/** Persist the built guidelines deck spec alongside the brain (internal tool). */
export async function saveGuidelines(slug: string, spec: unknown, account = DEFAULT_ACCOUNT): Promise<void> {
  const ts = nowISO();
  let id = await brandIdBySlug(slug, account);
  if (!id) {
    id = genId("brd");
    await run("INSERT INTO brands (id, account_id, slug, name, brain_json, has_research, has_guidelines, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 0, 1, ?, ?)",
      [id, account, slug, slug, ts, ts]);
  }
  await run("UPDATE brands SET guidelines_json = ?, has_guidelines = 1, updated_at = ? WHERE id = ?", [JSON.stringify(spec), ts, id]);
}

export async function getGuidelines(slug: string, account = DEFAULT_ACCOUNT): Promise<unknown | null> {
  const row = await one<{ guidelines_json?: string | null }>("SELECT guidelines_json FROM brands WHERE account_id = ? AND slug = ?", [account, slug]);
  return safeParse(row?.guidelines_json);
}
