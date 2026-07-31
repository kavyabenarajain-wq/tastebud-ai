"use client";

import { useEffect, useRef, useState } from "react";
import { activeAccount } from "@/lib/account";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * The signed-in identity in the WorkBar: Google avatar + first name, with a sign-out.
 *
 * Reads the localStorage mirror AuthSync keeps (re-reading on the "tb:auth" event it fires), so it
 * always reflects the current session without an async call. Sign-out ends the REAL Supabase session
 * (auth.signOut → SIGNED_OUT → AuthSync clears the mirror), then hard-navigates home so no stale
 * client state survives. Monochrome, matching the WorkBar — the UI recedes, the work is the colour.
 */
export function AccountMenu() {
  const [acct, setAcct] = useState<{ email: string | null; firstName: string; avatarUrl: string }>({
    email: null,
    firstName: "",
    avatarUrl: "",
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      const a = activeAccount();
      setAcct({ email: a.email, firstName: a.firstName, avatarUrl: a.avatarUrl });
    };
    read();
    window.addEventListener("tb:auth", read);
    return () => window.removeEventListener("tb:auth", read);
  }, []);

  // Reset the image-failed flag when the avatar URL changes (e.g. a re-login refreshes it).
  useEffect(() => {
    setImgFailed(false);
  }, [acct.avatarUrl]);

  // Close the popover on any outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (supabaseConfigured()) await supabaseBrowser().auth.signOut();
    } catch {
      /* even if the network call fails, drop them to home — the middleware re-gates from there */
    }
    try {
      localStorage.removeItem("tb.account");
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  };

  if (!acct.email) return null; // nothing to show until the session mirror lands

  const initial = (acct.firstName || acct.email).trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-hairline py-1 pl-1 pr-3 text-[12px] text-ink transition-opacity hover:opacity-70"
        title={acct.email}
      >
        {acct.avatarUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={acct.avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-white">
            {initial}
          </span>
        )}
        <span className="max-w-[9rem] truncate">{acct.firstName || acct.email}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-hairline bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <div className="border-b border-hairline px-3 py-2.5">
            {acct.firstName && <p className="text-[13px] font-medium text-ink">{acct.firstName}</p>}
            <p className="truncate text-[12px] text-muted">{acct.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="block w-full px-3 py-2.5 text-left text-[13px] text-ink transition-colors hover:bg-surface disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
