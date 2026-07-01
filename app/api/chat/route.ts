import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runAgent, type ChatMsg, type ConvState } from "@/lib/agent";
import { brainToProfile } from "@/lib/onboard";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// The conversation turn: the creative-director agent replies and may emit UI actions.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; state: ConvState; hasBrand?: boolean; brand?: BrandBrain };
  try {
    const skill = await readSkill("product-photoshoot");
    // Prefer the learned brand brain; fall back to the seeded profile.
    const profile = body.brand?.name ? brainToProfile(body.brand) : body.hasBrand === false ? null : await loadBrandProfile().catch(() => null);
    const { reply, actions } = await runAgent({ skill, profile, state: body.state ?? {}, messages: body.messages ?? [] });
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
