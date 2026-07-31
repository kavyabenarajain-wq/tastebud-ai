import type { NextRequest } from "next/server";
import { listBrains, saveBrain, createDiscoveryBrain } from "@/lib/brainStore";
import { DEFAULT_ACCOUNT } from "@/lib/store";
import { currentAccount, isOperator } from "@/lib/supabase/account";
import type { BrandBrain } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/brains → the SIGNED-IN account's brands only (the brand picker). One customer never
// sees another's brands. `?scope=internal` returns the shared internal/discovery bucket, but only
// for an allowlisted operator (the deck tool); everyone else silently gets their own list.
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("scope") === "internal" && (await isOperator())) {
      return Response.json({ brains: await listBrains(DEFAULT_ACCOUNT), scope: "internal" });
    }
    return Response.json({ brains: await listBrains(await currentAccount()) });
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
    // A discovery booking is an operator-side lead pre-create — it stays in the shared internal
    // bucket (a public, unauthenticated form; the lead isn't signed in yet).
    if (body.discovery?.name) {
      const meta = await createDiscoveryBrain(body.discovery.name, body.discovery.email);
      return Response.json({ ok: true, meta });
    }
    // A customer saving their own brand → scoped to THEIR account, so it's private to them. Stamp
    // the owner email on the row too (feeds the CRM brand_directory view).
    if (body.brain?.name) {
      const account = await currentAccount();
      const email = body.email ?? (account !== DEFAULT_ACCOUNT ? account : undefined);
      const meta = await saveBrain(body.brain, { origin: body.origin, email, account });
      return Response.json({ ok: true, meta });
    }
    return Response.json({ ok: false, error: "Nothing to save — need a brand name." }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
