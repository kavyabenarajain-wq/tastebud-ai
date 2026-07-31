import { NextResponse } from "next/server";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { syncProfileFromUser } from "@/lib/supabase/profile";
import { listBrains } from "@/lib/brainStore";

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

  const { data, error } = await supabaseServer().auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(error.message)}`);
  }

  // Provision/refresh the customer profile the instant the session exists — name, avatar, provider,
  // signup/signin event — from the exchange's user directly (the just-set cookie isn't readable in
  // THIS request, so getUser() would miss it). Non-fatal: a hiccup here must not block the login.
  try {
    await syncProfileFromUser(data.session?.user ?? null);
  } catch {
    /* AuthSync's /api/account/sync ping will provision on the next request */
  }

  // Returning customer who already has a brand kit → drop them straight into their workspace with it
  // loaded, instead of the "enter your link" onboarding. Only override the DEFAULT landing (/choose);
  // an explicit ?next= (a deep link, pricing) is always honored. The email comes off the exchange
  // result itself so we don't depend on the just-set cookie being readable within this same request.
  if (next === "/choose") {
    const email = data.session?.user?.email?.trim().toLowerCase();
    if (email) {
      try {
        const brains = await listBrains(email);
        if (brains.length > 0) return NextResponse.redirect(`${origin}/studio/create`);
      } catch {
        /* fall through to the default landing */
      }
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
