"use client";

/**
 * The signed-in account, client side. This is a convenience MIRROR of the Supabase session that
 * AuthSync keeps in localStorage ("tb.account") — the durable authority is the session cookie, and
 * the server reads identity from it (lib/supabase/account.ts), so this record can never move anyone
 * else's Meals or data. Every request the client makes is additionally authorised server-side.
 */
export function activeAccount(): { email: string | null; firstName: string; lastName: string; avatarUrl: string } {
  try {
    const raw = localStorage.getItem("tb.account");
    if (raw) {
      const a = JSON.parse(raw) as { email?: unknown; firstName?: unknown; lastName?: unknown; avatarUrl?: unknown };
      const email =
        typeof a.email === "string" && a.email.includes("@") && !/\s/.test(a.email.trim())
          ? a.email.trim().toLowerCase()
          : null;
      return {
        email,
        firstName: typeof a.firstName === "string" ? a.firstName : "",
        lastName: typeof a.lastName === "string" ? a.lastName : "",
        avatarUrl: typeof a.avatarUrl === "string" ? a.avatarUrl : "",
      };
    }
  } catch {
    /* no storage / bad JSON → anonymous */
  }
  return { email: null, firstName: "", lastName: "", avatarUrl: "" };
}
