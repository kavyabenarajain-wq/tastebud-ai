import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runModelAgent, type ChatMsg, type ModelConvState } from "@/lib/model-agent";
import { brainToProfile } from "@/lib/onboard";
import { slugify } from "@/lib/brainStore";
import { recallAsText, logMessage } from "@/lib/store/agentMemory";
import { retrieveContext, captureConversation, captureFounderProfile } from "@/lib/memory";
import { background } from "@/lib/memory/bg";
import { currentAccount } from "@/lib/supabase/account";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The model-photoshoot conversation turn: the casting-director agent replies and may emit UI actions.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; state: ModelConvState; brand?: BrandBrain };
  try {
    const skill = await readSkill("model-photoshoot");
    // Scope this brand's learned memory to the signed-in account (never shared across customers).
    const account = await currentAccount();
    const profile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => null);
    // Agent memory: recall this brand's learned taste (one shared memory across product + model),
    // plus semantic recall from the external memory layer. Both degrade to "" when unavailable.
    const slug = body.brand?.name ? slugify(body.brand.name) : null;
    const msgs = body.messages ?? [];
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const [localMemory, retrieved] = await Promise.all([
      slug ? recallAsText(slug, { account }).catch(() => "") : Promise.resolve(""),
      slug ? retrieveContext(account, slug, lastUserMsg).catch(() => "") : Promise.resolve(""),
    ]);
    const memory = [localMemory, retrieved].filter(Boolean).join("\n\n");
    const { reply, actions } = await runModelAgent({ skill, profile, state: body.state ?? {}, messages: msgs, memory });
    if (slug) {
      const lastUser = [...msgs].reverse().find((m) => m.role === "user");
      if (lastUser?.content) void logMessage(slug, "user", lastUser.content, { mode: "model", account }).catch(() => {});
      if (reply) void logMessage(slug, "assistant", reply, { mode: "model", account }).catch(() => {});
      // Memory capture — reliable background work (waitUntil): founder profile on the first turn only,
      // plus a throttled distilled session summary. Never blocks the reply; still lands in prod.
      const userTurns = msgs.filter((m) => m.role === "user").length;
      if (body.brand && userTurns <= 1) background(captureFounderProfile(account, body.brand));
      if (reply && userTurns >= 2 && userTurns % 2 === 0) background(captureConversation(account, slug, "model", msgs, reply));
    }
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
