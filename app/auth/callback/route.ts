import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth landing strip. Google → Supabase (`/auth/v1/callback`) → HERE with a one-time `code`,
 * which we exchange for the session cookies before handing the user on to `next`.
 *
 * Note this is NOT the URL registered in Google Cloud Console — Google only ever talks to
 * Supabase; Supabase talks to us.
 */

/** Only ever bounce to a path on THIS origin — an attacker-supplied `next` must not become an
 *  open redirect. Protocol-relative "//evil.com" is rejected along with absolute URLs. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/choose";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  // Google/Supabase report a refusal (closed consent screen, blocked app) on the query string.
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !supabaseConfigured()) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent("Sign-in link was incomplete. Please try again.")}`);
  }

  const { error } = await supabaseServer().auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
