import type { NextRequest } from "next/server";
import { runOnboard, type ChatMsg } from "@/lib/onboard";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: ChatMsg[]; brain: BrandBrain };
  try {
    const result = await runOnboard(body.messages ?? [], body.brain ?? {});
    return Response.json(result);
  } catch (err) {
    return Response.json({ reply: "Say that once more?", options: [], field: "", brainPatch: {}, complete: false, error: (err as Error).message });
  }
}
