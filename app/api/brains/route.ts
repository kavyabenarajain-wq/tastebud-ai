import type { NextRequest } from "next/server";
import { listBrains, saveBrain, createDiscoveryBrain } from "@/lib/brainStore";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/brains → list every brand folder (for the internal tool + brand picker).
export async function GET() {
  try {
    return Response.json({ brains: await listBrains() });
  } catch (err) {
    return Response.json({ brains: [], error: (err as Error).message });
  }
}

// POST /api/brains → save/merge a brain, or pre-create a discovery folder.
//   { brain }                         → save from Asset Studio
//   { discovery: { name, email } }    → pre-create from a booking
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    brain?: BrandBrain;
    discovery?: { name?: string; email?: string };
    origin?: "discovery" | "studio";
    email?: string;
  };
  try {
    if (body.discovery?.name) {
      const meta = await createDiscoveryBrain(body.discovery.name, body.discovery.email);
      return Response.json({ ok: true, meta });
    }
    if (body.brain?.name) {
      const meta = await saveBrain(body.brain, { origin: body.origin, email: body.email });
      return Response.json({ ok: true, meta });
    }
    return Response.json({ ok: false, error: "Nothing to save — need a brand name." }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
