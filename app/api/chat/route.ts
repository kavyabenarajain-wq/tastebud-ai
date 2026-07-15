import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { runAgent, type ChatMsg, type ConvState } from "@/lib/agent";
import { brainToProfile } from "@/lib/onboard";
import { slugify, listBrains } from "@/lib/brainStore";
import { recallAsText, logMessage } from "@/lib/store/agentMemory";
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
    // Agent memory: recall what we've learned about THIS brand across past sessions.
    const slug = body.brand?.name ? slugify(body.brand.name) : null;
    const memory = slug ? await recallAsText(slug).catch(() => "") : "";
    // The user's saved brands — the pool the brand-selection agent may switch between.
    const availableBrands = await listBrains().then((bs) => bs.map((b) => b.name)).catch(() => []);
    const { reply, actions } = await runAgent({ skill, profile, state: body.state ?? {}, messages: body.messages ?? [], memory, availableBrands });
    // Persist this turn (best-effort; durable per-brand thread + basis for cross-session recall).
    if (slug) {
      const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
      if (lastUser?.content) void logMessage(slug, "user", lastUser.content, { mode: "product" }).catch(() => {});
      if (reply) void logMessage(slug, "assistant", reply, { mode: "product" }).catch(() => {});
    }
    return Response.json({ reply, actions });
  } catch (err) {
    return Response.json({ reply: "I hit a snag there — say that again?", actions: [], error: (err as Error).message });
  }
}
