import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in order:
 *  1. AUTHENTICATE — refresh the Supabase token on every request and write the rotated cookies onto
 *     the response (Server Components can't set cookies themselves, so without this a session
 *     silently dies when its access token expires).
 *  2. AUTHORIZE — sign-in is REQUIRED to use the studio and the data/metered APIs. The durable
 *     COOKIE SESSION is the authority here (not the localStorage mirror the client keeps), so a
 *     valid session survives refresh/tab-close and a missing one is bounced consistently.
 *
 * Fail-OPEN on a getUser() exception (network/Supabase blip): we only redirect/401 on a DEFINITIVE
 * "no session" (getUser returned user:null with no throw), never on an inability to check — a
 * provider hiccup must not lock everyone out.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Local-dev only: turn OFF the sign-in wall for the WHOLE app so it can be used without logging in.
 * Double-guarded — needs the explicit NEXT_PUBLIC_DEV_NO_AUTH=1 opt-in (local .env only) AND a
 * non-production build — so it can NEVER unlock the live site (Vercel always builds as production).
 */
const DEV_NO_AUTH = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_NO_AUTH === "1";

/** Pages that require a signed-in user. Everything else (marketing, /signin, /auth/callback) is open. */
function isProtectedPage(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/") || pathname === "/choose" || pathname.startsWith("/choose/");
}

/** API routes that MUST stay reachable without a session (payment webhook, public image serving,
 *  and the profile-sync/self-checking endpoints that answer 401 on their own). */
function isPublicApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/billing/") || // Dodo webhook has no user session (verified by signature)
    pathname.startsWith("/api/img/") ||     // serves stored images
    pathname === "/api/book" ||             // discovery-call booking from ANONYMOUS prospects (public /discovery/book form)
    pathname === "/api/account/sync"        // reads the session itself, answers 401 when absent
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Not configured yet, OR local-dev with auth turned off → pass straight through (no session
  // needed anywhere). DEV_NO_AUTH is non-production only, so the live site is never affected.
  if (!URL_ || !KEY_ || DEV_NO_AUTH) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(URL_, KEY_, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Touching getUser() triggers the refresh-and-set-cookie path AND tells us who (if anyone) this is.
  // `false` = definitively signed out; `undefined` = we couldn't check (blip) → fail open.
  //
  // CRITICAL: @supabase/auth-js does NOT throw on a network/5xx blip — it collapses BOTH "no session"
  // (AuthSessionMissingError) and "couldn't reach Supabase" (AuthRetryableFetchError / AuthUnknownError)
  // into the same `{ data: { user: null }, error }` shape. So we must read the ERROR, not just catch:
  // enforce ONLY on a definitive no-session, and treat any transport/unknown error as "couldn't check"
  // and FAIL OPEN — otherwise a transient Supabase outage would mass-log-out every signed-in user.
  let signedIn: boolean | undefined;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) signedIn = !!data.user;
    else if (error.name === "AuthSessionMissingError") signedIn = false; // genuinely signed out
    else signedIn = undefined; // AuthRetryableFetchError / AuthUnknownError / other → blip, fail open
  } catch {
    signedIn = undefined; // lock timeout / unexpected throw — fail open
  }

  if (signedIn === false) {
    const isApi = pathname.startsWith("/api/");
    if (isApi && !isPublicApi(pathname)) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (isProtectedPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Everything except Next's static output and image files — no point refreshing a token to serve a PNG.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
