"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { activeAccount } from "@/lib/account";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { DAILY_DRIP } from "@/lib/meals";

/**
 * The "you have to sign up first" page. The Asset Studio is account-only — every shoot bills a
 * Meals ledger keyed to a signed-in email — so anyone who lands here without an account (a direct
 * link, a dropped session) gets this instead of the workspace. Studio-monochrome, one clear door.
 *
 * `next` carries the page they were trying to reach so /signin returns them straight back to it.
 */
export function SignUpRequired({ next = "/studio" }: { next?: string }) {
  const href = `/signin?next=${encodeURIComponent(next)}`;
  return (
    <main className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="flex items-center justify-between px-8 py-6">
        <Wordmark size="sm" href="/" />
        <Link href="/" className="text-[14px] text-clay transition-colors hover:text-ink">
          Back to site
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-linen text-ink">
            <Sparkles size={18} />
          </span>
          <h1 className="mt-6 font-serif text-4xl font-light leading-[1.05] tracking-tight md:text-5xl">
            Create an account to use the Asset Studio.
          </h1>
          <p className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-clay">
            The studio is for signed-in creators — every shoot draws from your own Meals. Make a
            free account and you&rsquo;ll start with {DAILY_DRIP} Meals on the house, every day.
          </p>

          <Link
            href={href}
            className="mt-9 inline-block rounded-control bg-carbon px-6 py-3 text-[15px] font-medium text-cream transition-opacity hover:opacity-90"
          >
            Create an account
          </Link>
          <p className="mt-4 text-[13px] text-clay">
            Already have one?{" "}
            <Link href={href} className="text-ink underline underline-offset-4 hover:opacity-70">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

/**
 * Wraps the whole /studio/* tree. No signed-in account → the studio never renders; the visitor
 * gets SignUpRequired instead. Re-checks on cross-tab storage changes and a same-tab `tb:auth`
 * event (fired by sign-in / sign-out), so gaining or losing an account flips the gate live.
 */
export function StudioAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setAuthed(!!activeAccount().email);
    check();
    window.addEventListener("storage", check);
    window.addEventListener("tb:auth", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("tb:auth", check);
    };
  }, []);

  // Undetermined (first tick, pre-hydration) → hold the field blank so signed-in users never
  // flash the gate and signed-out users never flash the workspace.
  if (authed === null) return <main className="min-h-screen bg-cream" />;
  // Carry the full path INCLUDING the query (usePathname drops it) so a deep link like
  // /studio/create?type=ad survives the sign-in round-trip instead of collapsing to defaults.
  if (!authed) {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return <SignUpRequired next={`${pathname || "/studio"}${search}`} />;
  }
  return <>{children}</>;
}
