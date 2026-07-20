"use client";

import { useEffect } from "react";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Bridges the Supabase session into the legacy `tb.account` localStorage record.
 *
 * Why a bridge instead of a rewrite: `activeAccount()` is SYNCHRONOUS and read all over the client
 * (studio pages, MealsPill, pricing). Making it async to await a Supabase call would ripple through
 * every call site. Instead this mirrors the session into the shape those call sites already read,
 * so signing in with Google just works everywhere with no other client change.
 *
 * The mirror is a CONVENIENCE, never an authority: servers read identity from the session cookie
 * (lib/supabase/account.ts), so editing localStorage can't move anyone's Meals.
 *
 * Renders nothing; mounted once in the root layout.
 */
export function AuthSync() {
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = supabaseBrowser();

    const write = (user: { email?: string | null; created_at?: string; user_metadata?: Record<string, unknown> }) => {
      if (!user.email) return;
      const meta = user.user_metadata ?? {};
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const full = str(meta.full_name) || str(meta.name);
      const [firstFromFull = "", ...restOfFull] = full ? full.split(/\s+/) : [];
      try {
        localStorage.setItem(
          "tb.account",
          JSON.stringify({
            firstName: str(meta.given_name) || firstFromFull,
            lastName: str(meta.family_name) || restOfFull.join(" "),
            email: user.email,
            createdAt: user.created_at ?? new Date().toISOString(),
          }),
        );
      } catch {
        /* storage disabled — the server still knows who this is */
      }
      // Existing listeners (wallet balance, greetings) already re-read on this event.
      window.dispatchEvent(new Event("tb:auth"));
    };

    const clear = () => {
      try {
        localStorage.removeItem("tb.account");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("tb:auth"));
    };

    // getUser() revalidates against Supabase rather than trusting the stored session blob.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) write(data.user);
    }).catch(() => { /* offline — leave any existing record alone */ });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) write(session.user);
      else if (event === "SIGNED_OUT") clear();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
