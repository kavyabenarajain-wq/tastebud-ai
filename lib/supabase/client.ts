"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase browser client (auth ONLY — the app's data lives in Supabase Postgres, see lib/store).
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

/**
 * ONE GoTrueClient per browser tab — cached at module scope.
 *
 * Why a singleton is load-bearing: minting a fresh client on every call spins up a second
 * GoTrueClient with autoRefreshToken on. When two live instances (e.g. AuthSync + the signin page)
 * both try to rotate the refresh token, the loser gets "Invalid Refresh Token: Already Used" and
 * emits a spurious SIGNED_OUT — which used to wipe the login and bounce the user to /signin on a
 * simple refresh. Sharing one instance removes that race entirely.
 */
let cached: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
