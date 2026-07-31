"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Sign in — the site's one gate. Google OAuth ONLY.
 *
 * Google mints a real Supabase cookie session that the middleware refreshes on every request, so a
 * signed-in creator STAYS signed in across reloads, new tabs and new devices. (The old
 * email/password form was a localStorage-only stub — no server session — so it could never actually
 * keep anyone logged in, and it left the server unable to scope brands to a real owner. It's gone.)
 *
 * Honors ?next= (default /choose). One button handles both sign-up and sign-in: Google returns known
 * users to their session and provisions new ones automatically.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const params = useSearchParams();
  const next = params.get("next") || "/choose";
  const toPricing = next.startsWith("/pricing");

  const [busy, setBusy] = useState(false);
  const [oauthErr, setOauthErr] = useState<string | null>(params.get("error"));

  const continueWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setOauthErr(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) {
        setOauthErr(error.message);
        setBusy(false);
      }
    } catch {
      setOauthErr("Couldn't reach Google sign-in. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-paper text-carbon">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-carbon transition-opacity duration-300 hover:opacity-60">tastebud</Link>
        <Link href="/" className="text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">Back to site</Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className="font-edito text-4xl font-light tracking-tight md:text-5xl">Sign in</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-clay">
            {toPricing
              ? "Sign in to continue to checkout — you'll stay signed in on this device."
              : "Sign in to build on-brand. You'll stay signed in, and your brand kit is waiting when you come back."}
          </p>

          {oauthErr && <p className="mt-6 rounded-sm border border-carbon/30 bg-cream px-4 py-2.5 text-[13px] text-carbon">{oauthErr}</p>}

          {supabaseConfigured() ? (
            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={busy}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-sm border border-linen bg-cream px-4 py-3 text-[15px] font-medium text-carbon transition-colors hover:border-carbon/40 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.58-5.17 3.58-8.87z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
              </svg>
              {busy ? "Connecting…" : "Continue with Google"}
            </button>
          ) : (
            <p className="mt-8 rounded-sm border border-linen bg-cream px-4 py-3 text-[14px] leading-relaxed text-clay">
              Sign-in isn&rsquo;t configured yet. Please try again shortly.
            </p>
          )}

          <p className="mt-6 text-[13px] leading-relaxed text-clay">
            New to tastebud? Continue with Google and we&rsquo;ll set up your account automatically.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
