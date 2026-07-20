import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase server client — reads the session from the request cookies (Next 14: `cookies()` is
 * synchronous). Use this in route handlers and server components to learn WHO is calling, rather
 * than believing a client-supplied email.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until both public env vars are set — every caller degrades to "no session" instead of throwing. */
export function supabaseConfigured(): boolean {
  return !!URL_ && !!KEY_;
}

export function supabaseServer() {
  const store = cookies();
  return createServerClient(URL_, KEY_, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Throws when called during a Server Component render (cookies are read-only there).
        // Safe to swallow: middleware.ts performs the token refresh and writes the cookies.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* no-op — refreshed in middleware */
        }
      },
    },
  });
}
