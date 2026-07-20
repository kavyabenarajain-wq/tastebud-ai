import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth token on every request and writes the rotated cookies onto the
 * response. Without this a session silently dies when its access token expires, because Server
 * Components can't set cookies themselves.
 *
 * This middleware AUTHENTICATES but deliberately does not AUTHORIZE — it never redirects. Route
 * gating stays where it already lives (StudioAuthGate + the per-route Meals checks), so a misfire
 * here can't lock anyone out of the app.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function middleware(request: NextRequest) {
  // Not configured yet → pass straight through, so a missing env var can never 500 the whole site.
  if (!URL_ || !KEY_) return NextResponse.next({ request });

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

  // Touching getUser() is what triggers the refresh-and-set-cookie path. Failures are non-fatal:
  // a request with no (or a bad) session simply continues as anonymous.
  try {
    await supabase.auth.getUser();
  } catch {
    /* offline / auth blip — continue unauthenticated */
  }

  return response;
}

export const config = {
  // Everything except Next's static output and image files — no point refreshing a token to serve a PNG.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
