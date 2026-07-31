import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runAgent, type ChatMsg, type ConvState } from "@/lib/agent";
import { brainToProfile } from "@/lib/onboard";
import { slugify, listBrains } from "@/lib/brainStore";
import { recallAsText, logMessage } from "@/lib/store/agentMemory";
import { retrieveContext, captureConversation, captureFounderProfile } from "@/lib/memory";
import { background } from "@/lib/memory/bg";
import { currentAccount } from "@/lib/supabase/account";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The conversation turn: the creative-director agent replies and may emit UI actions.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; state: ConvState; hasBrand?: boolean; brand?: BrandBrain };
  try {
    const skill = await readSkill("product-photoshoot");
    // Everything the agent reads/writes is scoped to the signed-in account, so one customer's
    // brands and learned memory never bleed into another's conversation.
    const account = await currentAccount();
    // Prefer the learned brand brain; fall back to the seeded profile.
    const profile = body.brand?.name ? brainToProfile(body.brand) : body.hasBrand === false ? null : await loadBrandProfile().catch(() => null);
    // Agent memory: recall what we've learned about THIS brand across past sessions — the local
    // learned block PLUS semantic recall from the external memory layer (supermemory), keyed to
    // what the founder is asking now. Both degrade to "" (offline / no key), so the prompt is
    // unchanged when memory is unavailable.
    const slug = body.brand?.name ? slugify(body.brand.name) : null;
    const msgs = body.messages ?? [];
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const [localMemory, retrieved] = await Promise.all([
      slug ? recallAsText(slug, { account }).catch(() => "") : Promise.resolve(""),
      slug ? retrieveContext(account, slug, lastUserMsg).catch(() => "") : Promise.resolve(""),
    ]);
    const memory = [localMemory, retrieved].filter(Boolean).join("\n\n");
    // The user's saved brands — the pool the brand-selection agent may switch between (theirs only).
    const availableBrands = await listBrains(account).then((bs) => bs.map((b) => b.name)).catch(() => []);
    const { reply, actions } = await runAgent({ skill, profile, state: body.state ?? {}, messages: msgs, memory, availableBrands });
    // Persist this turn (best-effort; durable per-brand thread + basis for cross-session recall).
    if (slug) {
      const lastUser = [...msgs].reverse().find((m) => m.role === "user");
      if (lastUser?.content) void logMessage(slug, "user", lastUser.content, { mode: "product", account }).catch(() => {});
      if (reply) void logMessage(slug, "assistant", reply, { mode: "product", account }).catch(() => {});
      // Memory capture — RELIABLE background work (waitUntil): never blocks the reply, yet actually
      // lands in prod (a bare post-response promise is dropped at Vercel's response-flush). Founder
      // profile only on the first turn (it rarely changes); a DISTILLED session summary on a throttled
      // cadence — never every raw turn (cost).
      const userTurns = msgs.filter((m) => m.role === "user").length;
      if (body.brand && userTurns <= 1) background(captureFounderProfile(account, body.brand));
      if (reply && userTurns >= 2 && userTurns % 2 === 0) background(captureConversation(account, slug, "product", msgs, reply));
    }
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
