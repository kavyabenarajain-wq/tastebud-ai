"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

/**
 * Create account — the site's one gate.
 * Not wired to real auth yet: the account is kept in localStorage ("tb.account") so
 * the pricing gate and greetings work, and wiring real auth later is a drop-in.
 * Honors ?next= (pricing sends /pricing; default continues the studio flow at /choose).
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-cream" />}>
      <SignIn />
    </Suspense>
  );
}

const inputCls =
  "w-full rounded-xl border border-linen bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-clay/60 outline-none transition-colors focus:border-ink";

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/choose";
  const toPricing = next.startsWith("/pricing");

  const [busy, setBusy] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  // A real email is REQUIRED: the whole app keys the account (and Meals ledger + checkout) off it.
  // The password fields are validated client-side (length + match) so the form does what it shows —
  // no real auth backend yet, so the password isn't stored; it plugs in when auth lands.
  const validEmail = /\S+@\S+\.\S+/.test(email.trim());
  const validPw = pw.length >= 8;
  const pwMatch = pw2.length > 0 && pw === pw2;
  const valid = validEmail && validPw && pwMatch;

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
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="flex items-center gap-2.5 text-ink transition-opacity duration-300 hover:opacity-70">
          <span className="font-site-serif text-lg tracking-tight">tastebud</span>
        </Link>
        <Link href="/" className="text-[14px] text-clay transition-colors duration-300 hover:text-ink">
          Back to site
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="font-site-serif text-4xl font-light tracking-tight text-ink">Create an account</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-clay">
            {toPricing
              ? "One minute of setup, then you're ready to check out."
              : "Create your account to start building on-brand."}
          </p>

          <form
            className="mt-9 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" optional>
                <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="John" className={inputCls} />
              </Field>
              <Field label="Last name" optional>
                <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Doe" className={inputCls} />
              </Field>
            </div>
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className={inputCls}
              />
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
              className="mt-1 w-full rounded-xl bg-carbon px-4 py-3 text-[15px] font-medium text-cream transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="ml-1.5 text-[12px] font-normal text-clay">(optional)</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[12px] text-clay">{hint}</span>}
    </label>
  );
}
