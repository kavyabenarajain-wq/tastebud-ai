import { listImages } from "@/lib/store";
import { sessionEmail } from "@/lib/supabase/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/images — the signed-in user's gallery: every image they've made, newest first.
 * Identity comes ONLY from the verified session (the middleware already 401s anonymous callers;
 * this is the defense-in-depth check), so one user can never read another's images.
 */
export async function GET() {
  const account = await sessionEmail();
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const images = await listImages(account);
    return Response.json({ images }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
