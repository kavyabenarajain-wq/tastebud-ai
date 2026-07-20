import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { upsertProfile, logEvent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/sync — capture WHO just signed in, server-side and authoritative.
 *
 * Reads the VERIFIED Supabase user (email, name, provider) straight from the session cookie — the
 * client sends nothing that matters — and upserts the customer profile, then logs a signup/signin
 * event. The sign-in UI pings this once per session (see AuthSync). This is what populates the
 * "who came / their name / how / when" columns behind the customer_overview view.
 */
export async function POST() {
  if (!supabaseConfigured()) return Response.json({ ok: false, reason: "auth-not-configured" });
  try {
    const { data } = await supabaseServer().auth.getUser();
    const user = data.user;
    const email = user?.email?.trim().toLowerCase();
    if (!email) return Response.json({ ok: false, reason: "no-session" }, { status: 401 });

    const meta = (user!.user_metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const provider = str((user!.app_metadata as Record<string, unknown> | undefined)?.provider) ?? "email";
    const full = str(meta.full_name) ?? str(meta.name);

    const { created } = await upsertProfile({
      email,
      firstName: str(meta.given_name),
      lastName: str(meta.family_name),
      name: full,
      provider,
    });
    await logEvent(email, created ? "signup" : "signin", provider);
    return Response.json({ ok: true, created });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
