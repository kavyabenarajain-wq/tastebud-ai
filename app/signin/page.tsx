"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";

/**
 * PAGE 2 — Create account (stub).
 * A real-looking account gate that isn't wired to auth yet — every path continues to
 * the choose screen. Kept in the flow so wiring real auth later is a drop-in.
 */
export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const enter = () => {
    if (busy) return;
    setBusy(true);
    router.push("/choose");
  };

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-5">
          <BackLink href="/" />
          <Wordmark size="sm" href="/" />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="font-serif text-4xl font-light tracking-tight text-ink">Create an account</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">Enter your email and password to get started.</p>

          <form
            className="mt-9 space-y-5"
            onSubmit={(e) => { e.preventDefault(); enter(); }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" optional><input placeholder="John" className={inputCls} /></Field>
              <Field label="Last name" optional><input placeholder="Doe" className={inputCls} /></Field>
            </div>
            <Field label="Email"><input type="email" placeholder="john@example.com" className={inputCls} /></Field>
            <Field label="Password" hint="Must be at least 8 characters long">
              <input type="password" placeholder="••••••••" className={inputCls} />
            </Field>
            <Field label="Confirm password"><input type="password" placeholder="••••••••" className={inputCls} /></Field>

            <button
              type="submit"
              className="mt-1 w-full rounded-control bg-ink px-4 py-3 text-[15px] font-medium text-canvas transition-opacity hover:opacity-90"
            >
              Create account
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[11px] uppercase tracking-wide text-muted">or continue with</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>

          <button
            onClick={enter}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-hairline px-4 py-3 text-[15px] text-ink transition-colors hover:bg-surface"
          >
            <span className="font-serif text-lg">G</span> Sign up with Google
          </button>

          <p className="mt-6 text-center text-[14px] text-muted">
            Already have an account?{" "}
            <button onClick={enter} className="text-ink underline-offset-2 hover:underline">Sign in</button>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-ink";

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">{label}{optional && <span className="ml-1.5 text-[12px] font-normal text-muted">(optional)</span>}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}
