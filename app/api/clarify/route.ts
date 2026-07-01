import type { NextRequest } from "next/server";
import { readSkill } from "@/lib/skills";
import { loadBrandProfile } from "@/lib/brand";
import { askQuestions } from "@/lib/llm";
import { buildBrief } from "@/lib/brief";
import type { ResolvedBrief } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Intake: the art director reads the brief + brand and asks the few questions
// that most change the shoot, before anything is generated.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResolvedBrief;
  const mode = body.mode === "model-photoshoot" ? "model-photoshoot" : "product-photoshoot";
  try {
    const [skill, profile] = await Promise.all([readSkill(mode), loadBrandProfile()]);
    const questions = await askQuestions({ skill, profile, brief: buildBrief(body) });
    return Response.json({ questions });
  } catch (err) {
    return Response.json({ questions: [], error: (err as Error).message });
  }
}
