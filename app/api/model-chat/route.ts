import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runModelAgent, type ChatMsg, type ModelConvState } from "@/lib/model-agent";
import { brainToProfile } from "@/lib/onboard";
import { slugify } from "@/lib/brainStore";
import { recallAsText, logMessage } from "@/lib/store/agentMemory";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The model-photoshoot conversation turn: the casting-director agent replies and may emit UI actions.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; state: ModelConvState; brand?: BrandBrain };
  try {
    const skill = await readSkill("model-photoshoot");
    const profile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => null);
    // Agent memory: recall this brand's learned taste; one shared memory across product + model.
    const slug = body.brand?.name ? slugify(body.brand.name) : null;
    const memory = slug ? await recallAsText(slug).catch(() => "") : "";
    const { reply, actions } = await runModelAgent({ skill, profile, state: body.state ?? {}, messages: body.messages ?? [], memory });
    if (slug) {
      const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
      if (lastUser?.content) void logMessage(slug, "user", lastUser.content, { mode: "model" }).catch(() => {});
      if (reply) void logMessage(slug, "assistant", reply, { mode: "model" }).catch(() => {});
    }
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
