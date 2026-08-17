import OpenAI from "openai";

/**
 * Shared chat-model client. The agent brain is provider-swappable: an OpenAI
 * platform key (OPENAI_API_KEY → api.openai.com) wins when present, otherwise we
 * fall back to the Azure deployment (AZURE_OPENAI_*). Returns BOTH the client and
 * the model id so every call site (agent, planner, research, onboarding) stays in
 * lock-step. Model id is env-overridable — OPENAI_MODEL for the platform,
 * AZURE_OPENAI_DEPLOYMENT for Azure.
 */
export function chatClient(): { client: OpenAI; model: string } {
  return chatClients()[0];
}

/**
 * All configured chat providers, in preference order: the OpenAI platform first
 * (strongest reasoning), the Azure deployment second. Used by `chatComplete` to fail
 * over to a funded key when the primary is out of quota (429 / insufficient_quota) —
 * so a depleted OpenAI balance no longer takes the whole brain down while Azure has credit.
 */
export function chatClients(): { client: OpenAI; model: string; name: string }[] {
  // Bound EVERY call: the SDK default is a 10-minute timeout with 2 retries, so one stuck
  // request (e.g. a stalled research grounding loop) would hang the whole route far past its
  // maxDuration and the studio would never finish assembling. 90s + 1 retry caps that hard
  // while staying comfortably above a normal 4k-token completion.
  const OPTS = { timeout: 90_000, maxRetries: 1 } as const;
  const out: { client: OpenAI; model: string; name: string }[] = [];
  if (process.env.OPENAI_API_KEY) {
    out.push({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, ...OPTS }), model: process.env.OPENAI_MODEL ?? "gpt-5.5", name: "openai" });
  }
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    out.push({ client: new OpenAI({ apiKey: process.env.AZURE_OPENAI_API_KEY, baseURL: process.env.AZURE_OPENAI_ENDPOINT, ...OPTS }), model: process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.1", name: "azure" });
  }
  // Last resort: an OpenAI client that will surface a clear auth error rather than crash on []
  return out.length ? out : [{ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "", ...OPTS }), model: process.env.OPENAI_MODEL ?? "gpt-5.5", name: "openai" }];
}

const isQuotaError = (e: unknown): boolean => {
  const err = e as { status?: number; code?: string; message?: string } | undefined;
  const status = err?.status;
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`;
  return status === 429 || /insufficient_quota|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(text);
};

/**
 * Chat completion with automatic provider failover — the funded-key workhorse. Pass the
 * usual create params MINUS `model` (each provider supplies its own deployment id). Tries
 * each provider in order; a quota/429 error skips straight to the next funded key, while a
 * transient error retries the same provider a couple of times first. Supports tools/function
 * calling, so both the plain-text and agent (tool-use) call sites can share it.
 */
export async function chatCreate(
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">,
  opts: { retries?: number } = {},
): Promise<OpenAI.Chat.ChatCompletion> {
  const providers = chatClients();
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (const p of providers) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await p.client.chat.completions.create({ ...params, model: p.model });
      } catch (e) {
        lastErr = e;
        if (isQuotaError(e)) break;                                   // dry key → next provider
        await new Promise((res) => setTimeout(res, 600 * 2 ** attempt)); // transient → retry same
      }
    }
  }
  throw lastErr ?? new Error("no chat provider configured");
}

/**
 * Convenience wrapper over `chatCreate` that returns just the message content string.
 *
 * `reasoning_effort` matters on gpt-5.x REASONING models: hidden reasoning is billed against
 * `max_completion_tokens`, so a heavy prompt with a modest budget can burn the WHOLE budget on
 * reasoning and return EMPTY content (finish_reason "length"). Passing "low"/"minimal" keeps
 * reasoning small so the visible answer actually fits (and the call is faster).
 */
export async function chatComplete(params: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  max_completion_tokens?: number;
  // gpt-5.x accepts "none" and "xhigh" too; the installed SDK's type lags, so we widen + cast.
  reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
}): Promise<string> {
  const r = await chatCreate({
    messages: params.messages,
    max_completion_tokens: params.max_completion_tokens,
    ...(params.reasoning_effort ? { reasoning_effort: params.reasoning_effort as "low" } : {}),
  });
  return r.choices[0]?.message?.content ?? "";
}

/** True when the live-web search path is configured (an OpenRouter key). */
export const webSearchAvailable = (): boolean => !!process.env.OPENROUTER_API_KEY;

/**
 * LIVE web search completion — the grounded pass that actually reaches Instagram, press, Reddit,
 * review sites and the Meta Ad Library. Routed through OpenRouter's `:online` models, which run a
 * real web search and fold the results (with source URLs) into the model's context before it
 * answers. Best-effort by design: returns "" when no OpenRouter key is set or the call fails, so
 * the (already-complete) fast dossier is never blocked or broken by an enrichment miss.
 *
 * `OPENROUTER_SEARCH_MODEL` overrides the model (default a cheap `:online` variant).
 */
export async function webSearchComplete(params: {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  max_tokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return "";
  const model = process.env.OPENROUTER_SEARCH_MODEL ?? "openai/gpt-4o-mini:online";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 45_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: params.messages, max_tokens: params.max_tokens ?? 1200 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}
