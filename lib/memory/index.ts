import { createHash } from "node:crypto";
import { smAdd, smSearchMemories, smDeleteContainer, memoryEnabled, type SmMeta } from "./supermemory";
import { distillConversation } from "./distill";
import { remember, setSummary } from "@/lib/store/agentMemory";
import type { BrandBrain } from "@/lib/types";

/**
 * The MEMORY SEAM — the only module the rest of the app imports for the external memory layer.
 *
 * It owns three things:
 *   1. The tenant SCOPING — mapping our (account email, brand slug) onto supermemory container tags,
 *      with the email HASHED out (it's PII; also '@'/'.' aren't valid in a tag).
 *   2. CAPTURE helpers — fire-and-forget writes of DISTILLED signal (research dossier, founder
 *      profile, shot taste, chat distillations). Never the raw transcript.
 *   3. RETRIEVE helpers — semantic recall folded into the agent's prompt / the planner's taste.
 *
 * Everything degrades to a no-op / "" / [] when SUPERMEMORY_API_KEY is unset (see memoryEnabled),
 * and every write is fire-and-forget so it can never block a chat turn or a shoot. Supabase stays
 * the source of truth; supermemory only ever ADVISES — it is never read for ownership/tenancy.
 */

export { memoryEnabled };

// ── Scoping ──────────────────────────────────────────────────────────────────
// Two container tags per founder. Founder-level spans all their brands (cross-brand taste, profile);
// brand-level is one brand. Container tags are supermemory's HARD namespace boundary, so founder-vs-
// brand belongs in the tag, not in soft metadata. supermemory tags allow only alphanumerics, hyphens,
// underscores and DOTS (no colons) — so we separate with dots; the email is SHA1'd (it's PII).
const acctHash = (account: string) => createHash("sha1").update((account || "default").toLowerCase()).digest("hex").slice(0, 16);
export const founderTag = (account: string) => `founder.${acctHash(account)}`;
export const brandTag = (account: string, slug: string) => `brand.${acctHash(account)}.${slug}`;

export type MemoryKind =
  | "research" | "founder_profile" | "founder_uses"
  | "summary" | "preference" | "fact" | "shot_decision" | "correction";

const baseMeta = (account: string, kind: MemoryKind, extra: SmMeta): SmMeta => ({
  account: acctHash(account),
  kind,
  at: new Date().toISOString(),
  ...extra,
});

// ── Capture ──────────────────────────────────────────────────────────────────
// These are AWAITABLE (return the write promise, errors swallowed) so a caller can hand them to
// background() (waitUntil) and be sure they actually complete after the response — or await them
// where a bit of latency is fine. They never throw and no-op without a key.

/** Write one brand-scoped memory. A `docKey` makes it an idempotent UPSERT, namespaced by
 *  account+slug so two tenants who name a brand the same (same slug) can never collide on
 *  supermemory's project-wide customId space. */
export async function rememberBrand(account: string, slug: string, kind: MemoryKind, content: string, meta: SmMeta = {}, docKey?: string): Promise<void> {
  if (!memoryEnabled() || !content?.trim() || !slug) return;
  const customId = docKey ? `${docKey}.${acctHash(account)}.${slug}` : undefined;
  await smAdd({ content, containerTag: brandTag(account, slug), customId, metadata: baseMeta(account, kind, { brandSlug: slug, ...meta }) });
}

/** Write one founder-scoped memory (spans all their brands). `customId` (already account-unique,
 *  since the founder container is per-account) makes it an idempotent upsert. */
export async function rememberFounder(account: string, kind: MemoryKind, content: string, meta: SmMeta = {}, customId?: string): Promise<void> {
  if (!memoryEnabled() || !content?.trim()) return;
  await smAdd({ content, containerTag: founderTag(account), customId, metadata: baseMeta(account, kind, meta) });
}

/** Capture the founder's onboarding profile (role/company/team/uses) — idempotent upsert, so it
 *  stays current and, crucially, is available to WARM-START the founder's NEXT brand. Callers should
 *  gate this (it rarely changes) rather than run it every turn. */
export async function captureFounderProfile(account: string, brain: Pick<BrandBrain, "role" | "brandType" | "teamSize" | "uses">): Promise<void> {
  if (!memoryEnabled()) return;
  const bits: string[] = [];
  if (brain.role) bits.push(`role: ${brain.role}`);
  if (brain.brandType) bits.push(`company type: ${brain.brandType}`);
  if (brain.teamSize) bits.push(`team size: ${brain.teamSize}`);
  await Promise.all([
    bits.length ? rememberFounder(account, "founder_profile", `Founder profile — ${bits.join(", ")}.`, {}, `founder-profile.${acctHash(account)}`) : Promise.resolve(),
    brain.uses?.length ? rememberFounder(account, "founder_uses", `Founder uses tastebud for: ${brain.uses.join(", ")}.`, {}, `founder-uses.${acctHash(account)}`) : Promise.resolve(),
  ]);
}

/** Compose a readable dossier from the researched brain so supermemory can extract graph facts from
 *  prose (never dump the whole JSON blob). Defensive: reads only string / string[] fields. */
export function brandResearchDigest(brain: BrandBrain): string {
  const intel = brain.intelligence ?? {};
  const research = brain.research ?? {};
  const parts: string[] = [];
  const add = (label: string, v: unknown) => {
    const s = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" ? v : "";
    if (s.trim()) parts.push(`${label}: ${s.trim()}`);
  };
  add("Brand", brain.name);
  add("Positioning", intel.positioning || research.essence);
  add("Overview", intel.overview);
  add("Purpose", intel.purpose);
  add("Audience", intel.audience);
  add("Persona", intel.persona);
  add("Voice", intel.toneOfVoice || research.voice);
  add("Personality", intel.personality);
  add("Values", intel.values);
  add("Aesthetic", research.aesthetic || intel.photographyStyle || intel.visualIdentity);
  add("Competitors", (intel.competitors ?? []).map((c) => c?.name).filter(Boolean) as string[]);
  add("Ambassadors", (intel.ambassadors ?? []).map((a) => a?.name).filter(Boolean) as string[]);
  add("Past campaigns", (intel.campaigns ?? []).map((c) => c?.title).filter(Boolean) as string[]);
  return parts.length ? `BRAND DOSSIER (researched — treat as known unless the founder later corrects it):\n${parts.join("\n")}`.slice(0, 4000) : "";
}

/** Distil a chat exchange into durable memory, mirrored BOTH to the local agent_memory table (which
 *  lights up recallAsText — read every turn, previously written by nobody) AND to supermemory
 *  (semantic + founder-level). Best-effort; throttle the CALLS at the hook site to bound cost. */
export async function captureConversation(
  account: string,
  slug: string,
  mode: "product" | "model",
  messages: { role: string; content: string }[],
  reply: string,
): Promise<void> {
  try {
    const d = await distillConversation(messages, reply);
    if (!d) return;
    // AWAIT every write so a caller that hands this whole promise to background()/waitUntil is
    // guaranteed they land (a bare `void` here would be dropped at response-flush on Vercel).
    const tasks: Promise<unknown>[] = [];
    // Local (offline-safe, Supabase-authoritative) — this also lights up recallAsText.
    if (d.summary) tasks.push(setSummary(slug, d.summary, account).catch(() => {}));
    for (const p of d.preferences) tasks.push(remember(slug, "preference", p, 1, account).catch(() => {}));
    for (const f of d.facts) tasks.push(remember(slug, "fact", f, 1, account).catch(() => {}));
    // Supermemory (semantic recall + cross-brand founder taste). Summary upserts (docKey "summary").
    if (d.summary) tasks.push(rememberBrand(account, slug, "summary", d.summary, { mode }, "summary"));
    for (const p of d.preferences) tasks.push(rememberBrand(account, slug, "preference", p, { mode }));
    for (const f of d.facts) tasks.push(rememberFounder(account, "fact", f, { brandSlug: slug }));
    await Promise.all(tasks);
  } catch {
    /* memory is never allowed to throw into a request */
  }
}

// ── Retrieve ─────────────────────────────────────────────────────────────────

/** Merge + de-dupe hits from the brand and founder containers, strongest-similarity first. */
async function recall(account: string, slug: string | null, q: string, brandLimit: number, founderLimit: number): Promise<string[]> {
  if (!memoryEnabled() || !q?.trim()) return [];
  const [brand, founder] = await Promise.all([
    slug ? smSearchMemories({ q, containerTag: brandTag(account, slug), limit: brandLimit }) : Promise.resolve([]),
    founderLimit > 0 ? smSearchMemories({ q, containerTag: founderTag(account), limit: founderLimit }) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  return [...brand, ...founder]
    .sort((a, b) => b.similarity - a.similarity)
    .map((r) => r.memory.trim())
    .filter((m) => m && !seen.has(m) && (seen.add(m), true));
}

/** A ready-to-inject prompt block of relevant past-session memories (or "" when off/empty). */
export async function retrieveContext(account: string, slug: string | null, q: string, opts: { limit?: number } = {}): Promise<string> {
  const lines = await recall(account, slug, q, opts.limit ?? 6, 4);
  if (!lines.length) return "";
  return (
    "RETRIEVED MEMORY — relevant notes from this founder's past sessions (soft context; NEVER overrides " +
    "product fidelity, the brand's do-not list, or the client's explicit request):\n- " +
    lines.slice(0, 8).join("\n- ")
  );
}

/** Retrieved taste as a plain list, to merge into the art-director's learned-preferences. */
export async function retrievePreferences(account: string, slug: string | null, q: string, limit = 6): Promise<string[]> {
  const lines = await recall(account, slug, q, limit, 4);
  return lines.slice(0, limit);
}

/** GDPR / offboarding: wipe a founder's whole memory space (founder container + every brand). */
export async function deleteAccountMemories(account: string, slugs: string[]): Promise<void> {
  if (!memoryEnabled()) return;
  await smDeleteContainer(founderTag(account));
  for (const s of slugs) await smDeleteContainer(brandTag(account, s));
}
