import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BrandBrain, BrandMemory, Campaign, CampaignOutput, ShotMemory } from "./types";

/**
 * The Brand Brain store — the thread that ties Tastebud together (spec §"Brand Brain").
 *
 * One folder per brand under data/brains/<slug>/, holding everything learned about
 * that brand so research done once is reused everywhere:
 *   brain.json       — the BrandBrain (onboarding + research)
 *   guidelines.json  — the deck spec, once the internal tool has built it (optional)
 *   meta.json        — lightweight bookkeeping (created/updated, origin, contact)
 *
 * This is deliberately separate from the legacy single data/brand-profile.json and
 * from any output/brain.json — it never mutates those.
 */

const ROOT = join(process.cwd(), "data", "brains");

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

function dir(slug: string): string {
  return join(ROOT, slug);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function nowISO(): Promise<string> {
  // Date.now()/new Date() are fine in app server code (only workflow scripts forbid them).
  return new Date().toISOString();
}

/** List every brand folder, newest first. */
export async function listBrains(): Promise<BrainMeta[]> {
  let names: string[] = [];
  try {
    names = await readdir(ROOT);
  } catch {
    return [];
  }
  const metas: BrainMeta[] = [];
  for (const slug of names) {
    const d = dir(slug);
    try {
      if (!(await stat(d)).isDirectory()) continue;
    } catch {
      continue;
    }
    const meta = await readJson<BrainMeta>(join(d, "meta.json"));
    if (meta) metas.push(meta);
  }
  return metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getBrain(slug: string): Promise<BrandBrain | null> {
  return readJson<BrandBrain>(join(dir(slug), "brain.json"));
}

export async function getMeta(slug: string): Promise<BrainMeta | null> {
  return readJson<BrainMeta>(join(dir(slug), "meta.json"));
}

/**
 * Create or update a brand's brain. Slug is derived from the name; saving the same
 * brand again merges in place (research/guidelines accumulate, never re-asked).
 */
export async function saveBrain(
  brain: BrandBrain,
  opts: { origin?: BrainOrigin; email?: string } = {}
): Promise<BrainMeta> {
  const slug = slugify(brain.name || "brand");
  const d = dir(slug);
  await mkdir(d, { recursive: true });

  const prev = await readJson<BrainMeta>(join(d, "meta.json"));
  const prevBrain = await readJson<BrandBrain>(join(d, "brain.json"));
  // Merge so a later, lighter save never wipes earlier research.
  const merged: BrandBrain = { ...(prevBrain ?? {}), ...brain };
  if (prevBrain?.research && !brain.research) merged.research = prevBrain.research;

  const ts = await nowISO();
  const meta: BrainMeta = {
    slug,
    name: brain.name || prev?.name || "Brand",
    origin: opts.origin ?? prev?.origin ?? "studio",
    email: opts.email ?? prev?.email,
    createdAt: prev?.createdAt ?? ts,
    updatedAt: ts,
    hasResearch: Boolean(merged.research),
    hasGuidelines: Boolean(prev?.hasGuidelines),
  };

  await writeFile(join(d, "brain.json"), JSON.stringify(merged, null, 2), "utf8");
  await writeFile(join(d, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

const MEMORY_CAP = 24;

/**
 * Record one shot decision into the brand's memory (the "sharper every campaign" loop).
 * Read-modify-write DIRECTLY on brain.json — NOT via saveBrain, whose shallow top-level
 * merge would let a partial payload clobber accumulated memory. De-dupes by shot id and
 * moves an id between lists when it is re-decided; caps each list to the newest entries.
 * Returns the updated memory, or null if the brand doesn't exist.
 */
export async function recordShotDecision(slug: string, entry: ShotMemory): Promise<BrandMemory | null> {
  const d = dir(slug);
  const brain = await readJson<BrandBrain>(join(d, "brain.json"));
  if (!brain) return null;

  const mem: BrandMemory = brain.memory ?? { approvedShots: [], rejectedShots: [], heroShots: [] };
  const strip = (list?: ShotMemory[]) => (list ?? []).filter((s) => s.id !== entry.id);
  mem.approvedShots = strip(mem.approvedShots);
  mem.rejectedShots = strip(mem.rejectedShots);
  mem.heroShots = strip(mem.heroShots);

  const target =
    entry.decision === "reject" ? mem.rejectedShots
    : entry.decision === "hero" ? mem.heroShots!
    : mem.approvedShots;
  target.unshift(entry);

  mem.approvedShots = mem.approvedShots.slice(0, MEMORY_CAP);
  mem.rejectedShots = mem.rejectedShots.slice(0, MEMORY_CAP);
  mem.heroShots = (mem.heroShots ?? []).slice(0, MEMORY_CAP);
  mem.updatedAt = await nowISO();
  brain.memory = mem;

  await writeFile(join(d, "brain.json"), JSON.stringify(brain, null, 2), "utf8");
  const meta = await readJson<BrainMeta>(join(d, "meta.json"));
  if (meta) {
    meta.updatedAt = mem.updatedAt;
    await writeFile(join(d, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }
  return mem;
}

/**
 * Campaigns — the container grouping one brief's multi-format / multi-frame outputs
 * (ad fan-outs, carousels, Instagram creatives). Persisted in a SEPARATE
 * campaigns.json so they never route through saveBrain's shallow top-level merge
 * (a partial brain POST could otherwise clobber them). All read-modify-write.
 */
const CAMPAIGN_CAP = 60;

function campaignsPath(slug: string): string {
  return join(dir(slug), "campaigns.json");
}

/** Every campaign for a brand, newest-updated first. */
export async function getCampaigns(slug: string): Promise<Campaign[]> {
  const all = (await readJson<Campaign[]>(campaignsPath(slug))) ?? [];
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Upsert one campaign by id. An update with empty outputs keeps the outputs already
 * accumulated (so a rename / copy edit can never wipe the assets).
 */
export async function saveCampaign(slug: string, campaign: Campaign): Promise<Campaign> {
  const d = dir(slug);
  await mkdir(d, { recursive: true });
  const all = (await readJson<Campaign[]>(campaignsPath(slug))) ?? [];
  const i = all.findIndex((c) => c.id === campaign.id);
  const merged: Campaign = i >= 0
    ? { ...all[i], ...campaign, outputs: campaign.outputs?.length ? campaign.outputs : all[i].outputs }
    : { ...campaign, outputs: campaign.outputs ?? [] };
  merged.updatedAt = await nowISO();
  if (i >= 0) all[i] = merged;
  else all.unshift(merged);
  await writeFile(campaignsPath(slug), JSON.stringify(all.slice(0, CAMPAIGN_CAP), null, 2), "utf8");
  return merged;
}

/** Attach / replace one output on a campaign (de-duped by shot id, carousel order kept). */
export async function upsertCampaignOutput(slug: string, campaignId: string, output: CampaignOutput): Promise<Campaign | null> {
  const all = (await readJson<Campaign[]>(campaignsPath(slug))) ?? [];
  const c = all.find((x) => x.id === campaignId);
  if (!c) return null;
  c.outputs = [...(c.outputs ?? []).filter((o) => o.id !== output.id), output].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  c.updatedAt = await nowISO();
  await writeFile(campaignsPath(slug), JSON.stringify(all, null, 2), "utf8");
  return c;
}

/** Pre-create an empty brand folder from a Discovery booking (spec Page 5). */
export async function createDiscoveryBrain(name: string, email?: string): Promise<BrainMeta> {
  return saveBrain({ name }, { origin: "discovery", email });
}

/** Persist the built guidelines deck spec alongside the brain (internal tool). */
export async function saveGuidelines(slug: string, spec: unknown): Promise<void> {
  const d = dir(slug);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, "guidelines.json"), JSON.stringify(spec, null, 2), "utf8");
  const meta = await readJson<BrainMeta>(join(d, "meta.json"));
  if (meta) {
    meta.hasGuidelines = true;
    meta.updatedAt = await nowISO();
    await writeFile(join(d, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }
}

export async function getGuidelines(slug: string): Promise<unknown | null> {
  return readJson(join(dir(slug), "guidelines.json"));
}
