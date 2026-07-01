import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runModelAgent, type ChatMsg, type ModelConvState } from "@/lib/model-agent";
import { brainToProfile } from "@/lib/onboard";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The model-photoshoot conversation turn: the casting-director agent replies and may emit UI actions.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; state: ModelConvState; brand?: BrandBrain };
  try {
    const skill = await readSkill("model-photoshoot");
    const profile = body.brand?.name ? brainToProfile(body.brand) : await loadBrandProfile().catch(() => null);
    const { reply, actions } = await runModelAgent({ skill, profile, state: body.state ?? {}, messages: body.messages ?? [] });
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
