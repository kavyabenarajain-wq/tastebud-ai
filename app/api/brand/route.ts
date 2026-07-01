import { loadBrandProfile, saveBrandProfile } from "@/lib/brand";
import type { BrandProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const profile = await loadBrandProfile();
  return Response.json(profile);
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as BrandProfile;
    if (!body?.name) return Response.json({ error: "name is required" }, { status: 400 });
    await saveBrandProfile(body);
    return Response.json({ ok: true, profile: body });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
