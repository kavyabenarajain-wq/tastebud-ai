"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PLANS, TOPUP_PACKS, DAILY_DRIP, FREE_REDOS_PER_SHOT, type PlanId } from "@/lib/meals";

type Account = { firstName?: string; lastName?: string; email?: string };
type Snapshot = { balance: number; plan: PlanId };
type BuyableId = "starter" | "pro" | "studio" | "topup10" | "topup30" | "topup100";

/** Which checkout product each paid plan / pack maps to. */
const PLAN_BUYABLE: Partial<Record<PlanId, BuyableId>> = { starter: "starter", pro: "pro", studio: "studio" };
const PACK_BUYABLE: Record<number, BuyableId> = { 10: "topup10", 30: "topup30", 100: "topup100" };

// Where sign-in returns after a Buy click — pricing lives on the Asset building page now.
const RETURN_TO = "/asset-studio";

const FAQS = [
  {
    q: "What's a Meal?",
    a: "One Meal is one finished creative — art-directed, brand-locked, quality-checked and delivered at 4K. You pay per plated dish, never per attempt: retakes our quality check orders are on the house. Chat, brand research, exports and reformats are always free.",
  },
  {
    q: "What if I don't like a shot?",
    a: `Re-shoot it free. Every delivered creative comes with ${FREE_REDOS_PER_SHOT} free redos — a fresh take on the same shot, no Meal spent, because you already paid for that dish. If a redo still isn't landing it, tell the director exactly what to change ("warmer light", "on marble") and that refine is free too. You only spend Meals again when you shoot something new — a new brief or a whole new set.`,
  },
  {
    q: "What does the free plan actually include?",
    a: `${DAILY_DRIP} free Meals every day, forever. Enough to taste every part of the studio — product shoots, model shoots, campaigns — before paying anything.`,
  },
  {
    q: "Do Meals roll over?",
    a: "Monthly Meals reset with your billing cycle and daily Meals reset at midnight UTC — but top-up packs never expire.",
  },
  {
    q: "How do I cancel or change my plan?",
    a: "Manage billing (below the plans) opens your billing portal — change plan, update your card, download invoices or cancel any time. Cancelling drops you back to the free daily Meals, and anything you already generated stays yours.",
  },
  {
    q: "What happens to my brand data?",
    a: "Your brand brain — palette, products, voice, taste — belongs to you. We never train models on your assets, and you can export or delete everything whenever you like.",
  },
];

/**
 * PRICING SECTION — the Meals menu, embedded on the Asset building page (there is no separate
 * /pricing page). PUBLIC: anyone sees the plans; sign-in is required only at the Buy click
 * (buy/openPortal redirect to `/signin?next=/asset-studio`). A signed-in visitor also sees their
 * live balance/plan. Buy opens a Dodo checkout; the webhook does all granting.
 */
export function PricingSection() {
  const router = useRouter();
  const order: PlanId[] = ["free", "starter", "pro", "studio"];
  const [account, setAccount] = useState<Account | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [buying, setBuying] = useState<BuyableId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  // Read the account for personalisation only — the section always renders (SSR included) so the
  // plans are public and the #pricing anchor works on first paint.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tb.account");
      if (raw) setAccount(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!account?.email) return;
    const paid = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "success";
    setJustPaid(paid);
    const load = () =>
      fetch(`/api/meals?account=${encodeURIComponent(account.email!)}`)
        .then((r) => r.json())
        .then((j) => {
          if (typeof j.balance === "number") setSnap({ balance: j.balance, plan: j.plan });
        })
        .catch(() => {});
    load();
    if (!paid) return;
    const timers = [3000, 8000, 15000].map((ms) => setTimeout(load, ms));
    return () => timers.forEach(clearTimeout);
  }, [account?.email]);

  const buy = async (product: BuyableId) => {
    if (buying) return;
    if (!account?.email) { router.push(`/signin?next=${RETURN_TO}`); return; }
    setBuying(product);
    setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product,
          email: account.email,
          name: [account.firstName, account.lastName].filter(Boolean).join(" ") || undefined,
        }),
      });
      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
        return; // keep the button spinning through the redirect
      }
      setErr(j.error || "Couldn't start checkout.");
    } catch {
      setErr("Couldn't start checkout.");
    }
    setBuying(null);
  };

  const openPortal = async () => {
    if (!account?.email) { router.push(`/signin?next=${RETURN_TO}`); return; }
    setErr(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: account.email }),
      });
      const j = await res.json();
      if (j.url) window.open(j.url, "_blank", "noopener");
      else setErr(j.error || "Couldn't open the billing portal.");
    } catch {
      setErr("Couldn't open the billing portal.");
    }
  };

  return (
    <div id="pricing" className="scroll-mt-24">
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-8 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-[12px] uppercase tracking-wide text-clay"
        >
          {account?.firstName ? `Welcome, ${account.firstName}` : "Pricing"}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="mt-4 font-site-serif text-4xl font-light leading-[1.05] tracking-tight md:text-5xl"
        >
          Everything runs on Meals.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.4, 0, 0.2, 1] }}
          className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-clay"
        >
          <span className="text-ink">1 Meal = 1 creative.</span> Chat, brand research,
          exports and redos are free — and every day starts with {DAILY_DRIP} Meals on the house.
        </motion.p>

        {justPaid && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-8 max-w-md rounded-2xl border border-linen bg-paper px-6 py-4"
          >
            <p className="text-[15px] text-ink">Payment received — thank you.</p>
            <p className="mt-1 text-[13px] text-clay">
              Your Meals land within a few moments{snap ? ` — balance: ${Math.max(0, snap.balance)}` : ""}.{" "}
              <Link href="/choose" className="text-ink underline underline-offset-4">
                Start creating →
              </Link>
            </p>
          </motion.div>
        )}
        {err && (
          <p className="mx-auto mt-6 max-w-md rounded-xl border border-terra/40 bg-paper px-4 py-2.5 text-[13px] text-terra">{err}</p>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl items-stretch gap-5 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((id, i) => {
          const p = PLANS[id];
          const featured = !!p.recommended;
          const buyable = PLAN_BUYABLE[id];
          const isCurrent = snap ? snap.plan === id : false;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 0.06 * i, ease: [0.4, 0, 0.2, 1] }}
              className={`relative flex flex-col rounded-3xl p-7 ${
                featured ? "bg-carbon text-cream" : "border border-linen bg-paper"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-terra px-3.5 py-1 text-[12px] font-medium text-cream">
                  Most popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h3 className="font-site-serif text-lg font-light tracking-tight">{p.label}</h3>
                {isCurrent && (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${featured ? "bg-cream/15 text-cream/80" : "bg-cream text-clay"}`}>
                    Your plan
                  </span>
                )}
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-site-serif text-4xl font-light tracking-tight">
                  {p.priceUSD === null ? "Free" : `$${p.priceUSD}`}
                </span>
                {p.priceUSD !== null && (
                  <span className={`text-[13px] ${featured ? "text-cream/60" : "text-clay"}`}>/mo</span>
                )}
              </p>
              <p className={`mt-2 text-[13.5px] ${featured ? "text-cream/85" : "text-ink"}`}>
                {p.monthlyMeals > 0 ? (
                  <>
                    {p.monthlyMeals} Meals a month
                    <span className={featured ? "text-cream/60" : "text-clay"}> + {DAILY_DRIP} daily</span>
                  </>
                ) : (
                  `${DAILY_DRIP} free Meals a day`
                )}
              </p>
              <p className={`mt-3 flex-1 text-[14px] leading-relaxed ${featured ? "text-cream/70" : "text-clay"}`}>
                {p.blurb}
              </p>
              {id === "free" ? (
                <Link
                  href="/choose"
                  className="mt-7 rounded-xl bg-carbon px-5 py-2.5 text-center text-[14px] font-medium text-cream transition-opacity duration-300 hover:opacity-85"
                >
                  Start tasting
                </Link>
              ) : isCurrent ? (
                <button
                  onClick={openPortal}
                  className={`mt-7 rounded-xl px-5 py-2.5 text-[14px] font-medium transition-opacity duration-300 hover:opacity-80 ${
                    featured ? "border border-cream/25 text-cream" : "border border-linen text-ink"
                  }`}
                >
                  Manage plan
                </button>
              ) : (
                <button
                  onClick={() => buy(buyable!)}
                  disabled={buying !== null}
                  className={`mt-7 rounded-xl px-5 py-2.5 text-[14px] font-medium transition-opacity duration-300 hover:opacity-85 disabled:opacity-50 ${
                    featured ? "bg-cream text-carbon" : "bg-carbon text-cream"
                  }`}
                >
                  {buying === buyable ? "Opening checkout…" : `Get ${p.label}`}
                </button>
              )}
            </motion.div>
          );
        })}
      </section>

      <p className="pb-16 text-center text-[13px] text-clay">
        Already subscribed?{" "}
        <button onClick={openPortal} className="text-ink underline underline-offset-4">
          Manage billing
        </button>{" "}
        — invoices, card, cancel any time.
      </p>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-3xl border border-linen bg-paper p-8 md:p-10"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <h3 className="font-site-serif text-2xl font-light tracking-tight">Top-up packs</h3>
            <p className="text-[13px] text-clay">For the big shoot weeks. Top-up Meals never expire.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {TOPUP_PACKS.map((t) => {
              const buyable = PACK_BUYABLE[t.meals];
              return (
                <div key={t.meals} className="flex items-center justify-between rounded-2xl border border-linen px-6 py-5">
                  <div>
                    <span className="text-[15px]">{t.meals} Meals</span>
                    <span className="ml-2 font-site-serif text-lg font-light">${t.priceUSD}</span>
                  </div>
                  <button
                    onClick={() => buy(buyable)}
                    disabled={buying !== null}
                    className="rounded-lg bg-carbon px-4 py-2 text-[13px] font-medium text-cream transition-opacity duration-300 hover:opacity-85 disabled:opacity-50"
                  >
                    {buying === buyable ? "Opening…" : "Buy"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-clay">
            A six-image product shoot is 6 Meals. True-4K upscales and enhancer passes are 1 Meal each.
            Not happy with a shot? Every image includes {FREE_REDOS_PER_SHOT} free redos.
          </p>
        </motion.div>
      </section>

      <section id="faq" className="scroll-mt-24 border-t border-linen">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="text-center font-site-serif text-4xl font-light tracking-tight">Questions</h2>
          <div className="mt-10 divide-y divide-linen border-y border-linen">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] text-ink">
                  {f.q}
                  <span className="text-clay transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-clay">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-10 text-center text-[14px] text-clay">
            Something else?{" "}
            <Link href="/contact" className="text-ink underline-offset-4 hover:underline">
              Book a call
            </Link>{" "}
            — we&rsquo;ll walk you through it.
          </p>
        </div>
      </section>
    </div>
  );
}
