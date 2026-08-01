"use client";

import { useEffect, useState } from "react";
import { activeAccount } from "@/lib/account";
import { PLANS, TOPUP_PACKS, type PlanId } from "@/lib/meals";

/**
 * MealsStatus — the on-canvas wallet + conversion moment.
 *
 * Two jobs the plain balance pill can't do:
 *  1. Always show how many Meals are LEFT, in words the customer feels ("1 of 2 free tastes left").
 *  2. Turn running out into a MOTIVATIONAL upsell — not a dead "you're out" error. The bet: the
 *     first two images are so good the customer wants the rest, so the zero-state sells the plan
 *     off the work they just saw, warmly and on-brand ("A studio with taste").
 *
 * Self-fetches /api/meals (identity from the verified session server-side) and re-reads on the same
 * `meals:refresh` / auth / focus events the workspace already fires, so it never shows a stale count.
 * Renders nothing for owner/unenforced accounts. Buy links open /pricing in a NEW tab so an in-progress
 * shoot, chat thread and uploads are never torn down mid-work.
 */

type Snap = {
  balance: number;
  enforced: boolean;
  plan: PlanId;
  trial: { images: number; daysLeft: number; active: boolean };
};

const PRICING = "/pricing";

export function MealsStatus() {
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const load = () => {
      const email = activeAccount().email;
      if (!email) {
        if (alive) setSnap(null);
        return;
      }
      const mine = ++seq;
      fetch(`/api/meals?account=${encodeURIComponent(email)}`)
        .then((r) => r.json())
        .then((j) => {
          if (alive && mine === seq && typeof j.balance === "number") {
            // Defensive defaults — a malformed payload must never crash the canvas render.
            setSnap({
              balance: j.balance,
              enforced: !!j.enforced,
              plan: (j.plan as PlanId) ?? "free",
              trial: j.trial ?? { images: 2, daysLeft: 0, active: false },
            });
          }
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("meals:refresh", load);
    window.addEventListener("tb:auth", load); // same-tab sign-in/out
    window.addEventListener("storage", load); // cross-tab sign-in/out (matches the page's own effect)
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("meals:refresh", load);
      window.removeEventListener("tb:auth", load);
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Owner / unenforced / not-yet-loaded → the wallet isn't a factor, so show nothing.
  if (!snap || !snap.enforced) return null;

  const left = Math.max(0, snap.balance);
  const isFree = snap.plan === "free";
  const pack = TOPUP_PACKS[0]; // the smallest top-up — the lowest-friction "keep going" offer
  const rec = PLANS.pro; // Chef's Table — the recommended plan
  // "Free tastes" framing is only honest for a pure-trial balance. The moment a free user tops up,
  // `left` includes bought Meals (and can exceed the fixed trial size), so the "N of 2" phrasing
  // would misreport — fall back to a plain Meal count in that case.
  const onTrial = isFree && snap.trial.active && left <= snap.trial.images;

  const BuyLink = ({ children }: { children: React.ReactNode }) => (
    <a
      href={PRICING}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90"
    >
      {children}
    </a>
  );

  // ── OUT (0 Meals) — the conversion moment ──────────────────────────────────
  if (left <= 0) {
    return (
      <div className="mx-5 mb-2 rounded-card border border-ink/25 bg-surface px-4 py-3.5">
        {isFree ? (
          <>
            <p className="text-[13px] font-medium text-ink">Your free trial&rsquo;s used up.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Ready for the full menu? {rec.label} is {rec.monthlyMeals} on-brand images a month for ${rec.priceUSD},
              delivered at 4K — every shot unmistakably yours. Or grab {pack.meals} images for ${pack.priceUSD}, no subscription.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-ink">You&rsquo;re out of Meals this cycle.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Don&rsquo;t stop mid-shoot — top up {pack.meals} images for ${pack.priceUSD}. Top-ups never expire.
            </p>
          </>
        )}
        <div className="mt-3 flex items-center gap-3">
          <BuyLink>{isFree ? "Choose your plan" : "Top up"}</BuyLink>
          <span className="text-[11px] text-muted">1 Meal = 1 finished image</span>
        </div>
      </div>
    );
  }

  // ── LOW (1–2 left) — a warm nudge that keeps the count front-of-mind ────────
  if (left <= 2) {
    return (
      <div className="mx-5 mb-2 flex items-center gap-3 rounded-card border border-hairline bg-canvas px-3.5 py-2.5">
        <span className="flex-1 text-[12px] leading-relaxed text-ink">
          {onTrial ? (
            <>
              <span className="font-medium">{left} of {snap.trial.images} free {left === 1 ? "taste" : "tastes"} left.</span>{" "}
              <span className="text-muted">Loved it? A plan keeps every shoot coming — from {PLANS.starter.monthlyMeals} a month.</span>
            </>
          ) : (
            <>
              <span className="font-medium">{left} Meal{left === 1 ? "" : "s"} left.</span>{" "}
              <span className="text-muted">Top up so a shoot doesn&rsquo;t run dry mid-set.</span>
            </>
          )}
        </span>
        <BuyLink>{isFree ? "See plans" : "Top up"}</BuyLink>
      </div>
    );
  }

  // ── HEALTHY (3+) — a quiet always-on count so the wallet is never a surprise ─
  return (
    <div className="mx-5 mb-2 flex items-center gap-2 px-1 text-[11px] text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-ink/40" />
      <span>
        {onTrial ? `${left} of ${snap.trial.images} free tastes left` : `${left} Meals left`}
      </span>
      <a href={PRICING} target="_blank" rel="noopener noreferrer" className="text-ink underline-offset-2 transition-opacity hover:opacity-70">
        {isFree ? "See plans" : "Get more"}
      </a>
    </div>
  );
}
