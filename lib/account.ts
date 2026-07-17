"use client";

/**
 * The signed-in account, client side. Until real auth lands this is the localStorage
 * record the signin page writes ("tb.account"); every metered request carries its email
 * so the server bills the right ledger (server falls back to the shared default bucket
 * when absent — generation never hard-blocks on identity).
 */
export function activeAccount(): { email: string | null; firstName: string; lastName: string } {
  try {
    const raw = localStorage.getItem("tb.account");
    if (raw) {
      const a = JSON.parse(raw) as { email?: unknown; firstName?: unknown; lastName?: unknown };
      const email =
        typeof a.email === "string" && a.email.includes("@") && !/\s/.test(a.email.trim())
          ? a.email.trim().toLowerCase()
          : null;
      return {
        email,
        firstName: typeof a.firstName === "string" ? a.firstName : "",
        lastName: typeof a.lastName === "string" ? a.lastName : "",
      };
    }
  } catch {
    /* no storage / bad JSON → anonymous */
  }
  return { email: null, firstName: "", lastName: "" };
}
