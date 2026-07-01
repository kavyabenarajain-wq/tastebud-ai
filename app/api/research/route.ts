import type { NextRequest } from "next/server";
import { researchBrand } from "@/lib/research";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { brain: BrandBrain };
  try {
    const research = await researchBrand(body.brain ?? {});
    return Response.json({ research });
  } catch (err) {
    return Response.json({ research: null, error: (err as Error).message }, { status: 200 });
  }
}
