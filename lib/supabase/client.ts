"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (auth ONLY — the app's data still lives in libSQL/Turso, see lib/store).
 *
 * The session is kept in COOKIES by @supabase/ssr, not localStorage, so the server can read the
 * same session and bill the right ledger without trusting anything the client sends. Shipping the
 * anon key in the bundle is by design: it is a public key, and every privileged action is still
 * authorised server-side.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until both public env vars are set — lets the UI hide Google sign-in instead of crashing. */
export function supabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

export function supabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
