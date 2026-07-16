import { one, all, run, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";

/**
 * Agent memory — what the creative director LEARNS about a brand and carries between sessions.
 *
 * Two layers, both per-brand (multi-tenant by construction):
 *   • conversations + messages — the persistent chat thread (continuity across reloads)
 *   • agent_memory             — durable learned PREFERENCES, FACTS and a rolling SUMMARY
 *
 * Keyed by brand slug (within the default account until auth), best-effort: an unknown brand is
 * a silent no-op, never an error, so memory can never break a shoot.
 */

export type MemoryKind = "preference" | "fact" | "summary";
export interface StoredMessage { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
export interface MemoryItem { kind: MemoryKind; content: string }

// ── Conversations + messages ────────────────────────────────────────────────

async function ensureConversationId(brandId: string, mode: string): Promise<string> {
  const row = await one<{ id: string }>("SELECT id FROM conversations WHERE brand_id = ? AND mode = ? ORDER BY updated_at DESC LIMIT 1", [brandId, mode]);
  if (row) return row.id;
  const id = genId("cnv");
  const ts = nowISO();
  await run("INSERT INTO conversations (id, brand_id, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [id, brandId, mode, ts, ts]);
  return id;
}

/** Append one message to the brand's active conversation. Returns the conversation id (or null). */
export async function logMessage(slug: string, role: "user" | "assistant", content: string, opts: { mode?: string; account?: string } = {}): Promise<string | null> {
  if (!content?.trim()) return null;
  const brandId = await brandIdBySlug(slug, opts.account ?? DEFAULT_ACCOUNT);
  if (!brandId) return null;
  const convId = await ensureConversationId(brandId, opts.mode ?? "");
  const ts = nowISO();
  await run("INSERT INTO messages (id, conversation_id, brand_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)", [genId("msg"), convId, brandId, role, content.trim(), ts]);
  await run("UPDATE conversations SET updated_at = ? WHERE id = ?", [ts, convId]);
  return convId;
}

/** Recent messages for the brand's active conversation, oldest→newest (for continuity). */
export async function getRecentMessages(slug: string, opts: { mode?: string; limit?: number; account?: string } = {}): Promise<StoredMessage[]> {
  const brandId = await brandIdBySlug(slug, opts.account ?? DEFAULT_ACCOUNT);
  if (!brandId) return [];
  const conv = await one<{ id: string }>("SELECT id FROM conversations WHERE brand_id = ? AND mode = ? ORDER BY updated_at DESC LIMIT 1", [brandId, opts.mode ?? ""]);
  if (!conv) return [];
  const rows = await all<{ id: string; role: string; content: string; created_at: string }>(
    "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?", [conv.id, opts.limit ?? 20]);
  return rows.reverse().map((r) => ({ id: r.id, role: r.role === "user" ? "user" : "assistant", content: r.content, createdAt: r.created_at }));
}

// ── Durable learned memory (preferences / facts / summary) ───────────────────

/** Remember a preference or fact. De-dupes by content (bumps weight instead of duplicating). */
export async function remember(slug: string, kind: MemoryKind, content: string, weight = 1, account = DEFAULT_ACCOUNT): Promise<void> {
  if (!content?.trim()) return;
  const brandId = await brandIdBySlug(slug, account);
  if (!brandId) return;
  const c = content.trim();
  const ts = nowISO();
  const existing = await one<{ id: string; weight: number }>("SELECT id, weight FROM agent_memory WHERE brand_id = ? AND kind = ? AND content = ?", [brandId, kind, c]);
  if (existing) await run("UPDATE agent_memory SET weight = ?, updated_at = ? WHERE id = ?", [existing.weight + weight, ts, existing.id]);
  else await run("INSERT INTO agent_memory (id, brand_id, kind, content, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [genId("mem"), brandId, kind, c, weight, ts, ts]);
}

/** Replace the brand's rolling summary (there is only ever one). */
export async function setSummary(slug: string, content: string, account = DEFAULT_ACCOUNT): Promise<void> {
  const brandId = await brandIdBySlug(slug, account);
  if (!brandId) return;
  const ts = nowISO();
  await run("DELETE FROM agent_memory WHERE brand_id = ? AND kind = 'summary'", [brandId]);
  if (content?.trim()) await run("INSERT INTO agent_memory (id, brand_id, kind, content, weight, created_at, updated_at) VALUES (?, ?, 'summary', ?, 1, ?, ?)", [genId("mem"), brandId, content.trim(), ts, ts]);
}

/** Recall learned memory for a brand, strongest first. */
export async function recall(slug: string, opts: { kinds?: MemoryKind[]; limit?: number; account?: string } = {}): Promise<MemoryItem[]> {
  const brandId = await brandIdBySlug(slug, opts.account ?? DEFAULT_ACCOUNT);
  if (!brandId) return [];
  const kinds = opts.kinds ?? (["preference", "fact", "summary"] as MemoryKind[]);
  const placeholders = kinds.map(() => "?").join(", ");
  const rows = await all<{ kind: MemoryKind; content: string }>(
    `SELECT kind, content FROM agent_memory WHERE brand_id = ? AND kind IN (${placeholders}) ORDER BY weight DESC, updated_at DESC LIMIT ?`,
    [brandId, ...kinds, opts.limit ?? 40]);
  return rows.map((r) => ({ kind: r.kind, content: r.content }));
}

/** Recalled memory rendered as a compact block to drop into the agent's system prompt. */
export async function recallAsText(slug: string, opts: { limit?: number; account?: string } = {}): Promise<string> {
  const items = await recall(slug, opts);
  if (!items.length) return "";
  const prefs = items.filter((i) => i.kind === "preference").map((i) => i.content);
  const facts = items.filter((i) => i.kind === "fact").map((i) => i.content);
  const summary = items.find((i) => i.kind === "summary")?.content;
  const parts: string[] = [];
  if (summary) parts.push(`WHERE WE LEFT OFF: ${summary}`);
  if (prefs.length) parts.push(`THIS BRAND'S LEARNED PREFERENCES (honour them): ${prefs.join("; ")}.`);
  if (facts.length) parts.push(`REMEMBERED FACTS ABOUT THIS BRAND: ${facts.join("; ")}.`);
  return parts.length ? `MEMORY — what you already know about this brand from past sessions:\n${parts.join("\n")}` : "";
}
