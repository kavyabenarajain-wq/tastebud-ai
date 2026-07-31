import { supabaseConfigured } from "@/lib/supabase/server";
import { syncSignedInProfile } from "@/lib/supabase/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/sync — capture WHO just signed in, server-side and authoritative.
 *
 * Reads the VERIFIED Supabase user straight from the session cookie (the client sends nothing that
 * matters) and upserts the customer profile — name, avatar, provider — then logs a signup/signin.
 * AuthSync pings this once per session as a belt-and-suspenders to the callback's own provisioning.
 * This is what populates the "who came / their name / how / when" columns behind customer_overview.
 */
export async function POST() {
  if (!supabaseConfigured()) return Response.json({ ok: false, reason: "auth-not-configured" });
  try {
    const { email, created } = await syncSignedInProfile();
    if (!email) return Response.json({ ok: false, reason: "no-session" }, { status: 401 });
    return Response.json({ ok: true, created });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
