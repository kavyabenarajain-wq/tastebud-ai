"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Create account — the site's one gate. Light monochrome.
 * Account kept in localStorage ("tb.account"); honors ?next= (default /choose). Auth logic unchanged.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <SignIn />
    </Suspense>
  );
}

const inputCls =
  "w-full rounded-sm border border-linen bg-paper px-3.5 py-2.5 text-[15px] text-carbon placeholder:text-clay/60 outline-none transition-colors focus:border-carbon";

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/choose";
  const toPricing = next.startsWith("/pricing");

  const [busy, setBusy] = useState(false);
  const [oauthErr, setOauthErr] = useState<string | null>(params.get("error"));
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const validEmail = /\S+@\S+\.\S+/.test(email.trim());
  const validPw = pw.length >= 8;
  const pwMatch = pw2.length > 0 && pw === pw2;
  const valid = validEmail && validPw && pwMatch;

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

  const enter = () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      localStorage.setItem(
        "tb.account",
        JSON.stringify({ firstName: first.trim(), lastName: last.trim(), email: email.trim(), createdAt: new Date().toISOString() })
      );
    } catch {}
    router.push(next);
  };

  return (
    <main className="flex min-h-screen flex-col bg-paper text-carbon">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-edito text-[20px] tracking-tight text-carbon transition-opacity duration-300 hover:opacity-60">tastebud</Link>
        <Link href="/" className="text-[11px] uppercase tracking-[0.14em] text-clay transition-colors duration-300 hover:text-carbon">Back to site</Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className="font-edito text-4xl font-light tracking-tight md:text-5xl">Create an account</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-clay">
            {toPricing ? "One minute of setup, then you're ready to check out." : "Create your account to start building on-brand."}
          </p>

          {oauthErr && <p className="mt-6 rounded-sm border border-carbon/30 bg-cream px-4 py-2.5 text-[13px] text-carbon">{oauthErr}</p>}

          {supabaseConfigured() && (
            <>
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
                Continue with Google
              </button>
              <div className="mt-6 flex items-center gap-4">
                <span className="h-px flex-1 bg-linen" />
                <span className="text-[11px] uppercase tracking-[0.2em] text-clay">or</span>
                <span className="h-px flex-1 bg-linen" />
              </div>
            </>
          )}

          <form className="mt-6 space-y-5" onSubmit={(e) => { e.preventDefault(); enter(); }}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" optional>
                <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="John" className={inputCls} />
              </Field>
              <Field label="Last name" optional>
                <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Doe" className={inputCls} />
              </Field>
            </div>
            <Field label="Email">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" className={inputCls} />
            </Field>
            <Field label="Password" hint="Must be at least 8 characters long">
              <input required minLength={8} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" className={inputCls} />
            </Field>
            <Field label="Confirm password" hint={pw2.length > 0 && !pwMatch ? "Passwords don't match" : undefined}>
              <input required type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" className={inputCls} />
            </Field>

            <button
              type="submit"
              disabled={!valid || busy}
              className="mt-1 w-full rounded-full bg-carbon px-4 py-3 text-[12px] font-medium uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-clay">
        {label}
        {optional && <span className="ml-1.5 text-[10px] normal-case tracking-normal text-clay/70">(optional)</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[12px] text-clay">{hint}</span>}
    </label>
  );
}
