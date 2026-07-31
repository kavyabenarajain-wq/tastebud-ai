import Supermemory from "supermemory";

/**
 * Low-level supermemory (supermemory.ai) client — the ONLY file that imports the SDK.
 *
 * Dormant-until-configured, exactly like the Replicate / Higgsfield gating elsewhere: with no
 * SUPERMEMORY_API_KEY every call is a silent no-op (add → null, search → []), so the app behaves
 * identically when the key is absent. The base URL is read by the SDK from SUPERMEMORY_BASE_URL
 * (default https://api.supermemory.ai), so pointing at a self-hosted instance is a pure env change.
 *
 * Every call swallows its own errors and is time-boxed — supermemory can be slow, down, or
 * unconfigured and it must NEVER block a chat turn or a shoot. The app seam that everything else
 * imports is lib/memory/index.ts; this file stays a thin, replaceable adapter.
 */

const KEY = process.env.SUPERMEMORY_API_KEY;

export const memoryEnabled = (): boolean => !!KEY;

let _client: Supermemory | null = null;
function client(): Supermemory | null {
  if (!KEY) return null;
  // apiKey + baseURL both default from env (SUPERMEMORY_API_KEY / SUPERMEMORY_BASE_URL); we pass the
  // key explicitly so the gate above is the single source of truth for "configured".
  if (!_client) _client = new Supermemory({ apiKey: KEY });
  return _client;
}

/** supermemory metadata values are scalars or string arrays — never nested objects/null. */
export type SmMeta = Record<string, string | number | boolean | Array<string>>;
export interface SmHit { memory: string; similarity: number; metadata: Record<string, unknown> | null; updatedAt?: string }

/** Race a promise against a timeout so a slow supermemory call can never stall the request. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error("supermemory timeout")), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(t)), timeout]);
}

/** Ingest one memory/document into a container. Returns null (never throws) when off/failed. */
export async function smAdd(p: {
  content: string;
  containerTag: string;
  metadata?: SmMeta;
  customId?: string;
}): Promise<{ id: string; status: string } | null> {
  const c = client();
  if (!c || !p.content?.trim()) return null;
  try {
    // supermemory's own second-phase pass consolidates related memories into graph facts
    // (dedupe / update / decay) server-side, so we just ingest distilled prose here.
    return await withTimeout(
      c.documents.add({
        content: p.content,
        containerTag: p.containerTag,
        metadata: p.metadata,
        customId: p.customId,
      }),
      8000,
    );
  } catch (e) {
    console.warn("[memory] add failed:", (e as Error).message);
    return null;
  }
}

/** Semantic recall over one container. Returns [] (never throws) when off/slow/failed. */
export async function smSearchMemories(p: {
  q: string;
  containerTag: string;
  limit?: number;
  rerank?: boolean;
  searchMode?: "memories" | "hybrid" | "documents";
  timeoutMs?: number;
}): Promise<SmHit[]> {
  const c = client();
  if (!c || !p.q?.trim()) return [];
  try {
    const res = await withTimeout(
      c.search.memories({
        q: p.q,
        containerTag: p.containerTag,
        limit: p.limit ?? 6,
        rerank: p.rerank ?? false,
        // "hybrid", NOT "memories": we store distilled PROSE as documents, and verified against the
        // live API that searchMode:"memories" returns nothing until the (much slower) graph-extraction
        // phase runs — whereas "hybrid" surfaces the document chunk the moment it's indexed AND any
        // extracted memory facts later. Our result mapping reads .memory ?? .chunk, so both land.
        searchMode: p.searchMode ?? "hybrid",
      }),
      p.timeoutMs ?? 700,
    );
    return (res.results ?? [])
      .map((r) => {
        const row = r as { memory?: string; chunk?: string };
        return { memory: (row.memory ?? row.chunk ?? "").trim(), similarity: r.similarity, metadata: r.metadata, updatedAt: r.updatedAt };
      })
      .filter((r) => r.memory);
  } catch {
    return [];
  }
}

/** Wipe every memory in a container tag (per-tenant / per-brand erasure). Best-effort. */
export async function smDeleteContainer(containerTag: string): Promise<boolean> {
  const c = client();
  if (!c) return false;
  try {
    await c.documents.deleteBulk({ containerTags: [containerTag] });
    return true;
  } catch (e) {
    console.warn("[memory] container delete failed:", (e as Error).message);
    return false;
  }
}
