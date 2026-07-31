import { complete, extractJson } from "@/lib/llm";

/**
 * Off-hot-path distillation: turn a slice of a creative-direction chat into DURABLE memory —
 * stable preferences, concrete facts, and a one-line "where we left off". This is what makes the
 * capture "distilled, not every raw turn" (the user's choice): we never store the transcript in
 * supermemory, only the distilled signal. Best-effort — any failure returns null and captures
 * nothing. Reuses lib/llm.ts complete() so it rides the same Azure/Claude provider as the agent.
 */

export interface Distilled { summary: string; preferences: string[]; facts: string[] }

export async function distillConversation(
  messages: { role: string; content: string }[],
  reply: string,
): Promise<Distilled | null> {
  const transcript = [...messages.slice(-12), { role: "assistant", content: reply }]
    .filter((m) => m.content?.trim())
    .map((m) => `${m.role === "user" ? "Founder" : "Director"}: ${m.content}`)
    .join("\n")
    .slice(0, 6000);
  if (!transcript.trim()) return null;

  const system =
    "You distill a creative-direction chat into durable memory for next time. Extract ONLY what will " +
    "still be true and useful in a future session about THIS founder and their brand: stable aesthetic " +
    "PREFERENCES (likes / dislikes / do / don't), concrete FACTS (product, audience, launch, positioning), " +
    "and a one-line 'where we left off'. Ignore pleasantries and anything ephemeral. Be terse and specific — " +
    "no fluff, no restating the obvious.";
  const user =
    `Conversation:\n${transcript}\n\n` +
    `Return STRICT JSON ONLY: {"summary":"one sentence or ''","preferences":["..."],"facts":["..."]}. ` +
    `Each array <= 5 items, each item <= 140 chars, no duplicates. Use empty arrays / '' when nothing is durable.`;

  try {
    const raw = await complete(system, user, 700, { reasoningEffort: "low" });
    const j = JSON.parse(extractJson(raw)) as { summary?: unknown; preferences?: unknown; facts?: unknown };
    const arr = (v: unknown): string[] =>
      Array.isArray(v)
        ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 140)))).slice(0, 5)
        : [];
    const summary = typeof j.summary === "string" ? j.summary.trim().slice(0, 300) : "";
    const preferences = arr(j.preferences);
    const facts = arr(j.facts);
    if (!summary && !preferences.length && !facts.length) return null;
    return { summary, preferences, facts };
  } catch {
    return null;
  }
}
