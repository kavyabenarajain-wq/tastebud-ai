import { getDb, tx, nowISO, genId, DEFAULT_ACCOUNT, brandIdBySlug } from "./db";

/**
 * Agent memory — what the creative director LEARNS about a brand and carries between
 * sessions, so it "plays along" instead of starting cold every time.
 *
 * Two layers, both per-brand (multi-tenant by construction):
 *   • conversations + messages — the persistent chat thread (continuity across reloads)
 *   • agent_memory             — durable learned PREFERENCES, FACTS and a rolling SUMMARY,
 *                                recalled into the system prompt so the agent remembers taste
 *
 * Everything is keyed by brand slug (within the default account until auth), best-effort:
 * an unknown brand is a silent no-op, never an error, so memory can never break a shoot.
 */

export type MemoryKind = "preference" | "fact" | "summary";
export interface StoredMessage { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
export interface MemoryItem { kind: MemoryKind; content: string }

// ── Conversations + messages ────────────────────────────────────────────────

function ensureConversationId(brandId: string, mode: string): string {
  const db = getDb();
  const row = db.prepare("SELECT id FROM conversations WHERE brand_id = ? AND mode = ? ORDER BY updated_at DESC LIMIT 1").get(brandId, mode) as unknown as { id: string } | undefined;
  if (row) return row.id;
  const id = genId("cnv");
  const ts = nowISO();
  db.prepare("INSERT INTO conversations (id, brand_id, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, brandId, mode, ts, ts);
  return id;
}

/** Append one message to the brand's active conversation. Returns the conversation id (or null). */
export async function logMessage(slug: string, role: "user" | "assistant", content: string, opts: { mode?: string; account?: string } = {}): Promise<string | null> {
  if (!content?.trim()) return null;
  return tx(() => {
    const db = getDb();
    const brandId = brandIdBySlug(db, slug, opts.account ?? DEFAULT_ACCOUNT);
    if (!brandId) return null;
    const convId = ensureConversationId(brandId, opts.mode ?? "");
    const ts = nowISO();
    db.prepare("INSERT INTO messages (id, conversation_id, brand_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(genId("msg"), convId, brandId, role, content.trim(), ts);
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(ts, convId);
    return convId;
  });
}

/** Recent messages for the brand's active conversation, oldest→newest (for continuity). */
export async function getRecentMessages(slug: string, opts: { mode?: string; limit?: number; account?: string } = {}): Promise<StoredMessage[]> {
  const db = getDb();
  const brandId = brandIdBySlug(db, slug, opts.account ?? DEFAULT_ACCOUNT);
  if (!brandId) return [];
  const conv = db.prepare("SELECT id FROM conversations WHERE brand_id = ? AND mode = ? ORDER BY updated_at DESC LIMIT 1").get(brandId, opts.mode ?? "") as unknown as { id: string } | undefined;
  if (!conv) return [];
  const rows = db.prepare("SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?").all(conv.id, opts.limit ?? 20) as unknown as { id: string; role: string; content: string; created_at: string }[];
  return rows.reverse().map((r) => ({ id: r.id, role: r.role === "user" ? "user" : "assistant", content: r.content, createdAt: r.created_at }));
}

// ── Durable learned memory (preferences / facts / summary) ───────────────────

/** Remember a preference or fact. De-dupes by content (bumps weight instead of duplicating). */
export async function remember(slug: string, kind: MemoryKind, content: string, weight = 1, account = DEFAULT_ACCOUNT): Promise<void> {
  if (!content?.trim()) return;
  tx(() => {
    const db = getDb();
    const brandId = brandIdBySlug(db, slug, account);
    if (!brandId) return;
    const c = content.trim();
    const ts = nowISO();
    const existing = db.prepare("SELECT id, weight FROM agent_memory WHERE brand_id = ? AND kind = ? AND content = ?").get(brandId, kind, c) as unknown as { id: string; weight: number } | undefined;
    if (existing) db.prepare("UPDATE agent_memory SET weight = ?, updated_at = ? WHERE id = ?").run(existing.weight + weight, ts, existing.id);
    else db.prepare("INSERT INTO agent_memory (id, brand_id, kind, content, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(genId("mem"), brandId, kind, c, weight, ts, ts);
  });
}

/** Replace the brand's rolling summary (there is only ever one). */
export async function setSummary(slug: string, content: string, account = DEFAULT_ACCOUNT): Promise<void> {
  tx(() => {
    const db = getDb();
    const brandId = brandIdBySlug(db, slug, account);
    if (!brandId) return;
    const ts = nowISO();
    db.prepare("DELETE FROM agent_memory WHERE brand_id = ? AND kind = 'summary'").run(brandId);
    if (content?.trim()) db.prepare("INSERT INTO agent_memory (id, brand_id, kind, content, weight, created_at, updated_at) VALUES (?, ?, 'summary', ?, 1, ?, ?)").run(genId("mem"), brandId, content.trim(), ts, ts);
  });
}

/** Recall learned memory for a brand, strongest first. */
export async function recall(slug: string, opts: { kinds?: MemoryKind[]; limit?: number; account?: string } = {}): Promise<MemoryItem[]> {
  const db = getDb();
  const brandId = brandIdBySlug(db, slug, opts.account ?? DEFAULT_ACCOUNT);
  if (!brandId) return [];
  const kinds = opts.kinds ?? (["preference", "fact", "summary"] as MemoryKind[]);
  const placeholders = kinds.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT kind, content FROM agent_memory WHERE brand_id = ? AND kind IN (${placeholders}) ORDER BY weight DESC, updated_at DESC LIMIT ?`).all(brandId, ...kinds, opts.limit ?? 40) as unknown as { kind: MemoryKind; content: string }[];
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
