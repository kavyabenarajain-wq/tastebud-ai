"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Reveal } from "./motion";
import { PLANS, TOPUP_PACKS, FREE_TRIAL_IMAGES, FREE_TRIAL_DAYS, FREE_REDOS_PER_SHOT, type PlanId } from "@/lib/meals";

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
    a: `${FREE_TRIAL_IMAGES} free images to create in your first ${FREE_TRIAL_DAYS} days — a taste of the whole studio (product shoots, model shoots, campaigns) before you pick a plan.`,
  },
  {
    q: "Do Meals roll over?",
    a: `Monthly Meals reset with your billing cycle, and free-trial Meals expire when your ${FREE_TRIAL_DAYS}-day trial ends — but top-up packs never expire.`,
  },
  {
    q: "How do I cancel or change my plan?",
    a: "Manage billing (below the plans) opens your billing portal — change plan, update your card, download invoices or cancel any time. Cancelling drops you back to the free plan, and anything you already generated stays yours.",
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
 *
 * Revamp note: warm-dark restyle only — the account, meals, checkout and portal wiring is untouched.
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
    <div id="pricing" className="scroll-mt-24 bg-paper">
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-24 text-center">
        {account?.firstName && (
          <Reveal blur={false}>
            <p className="mb-5 text-[11px] uppercase tracking-[0.2em] text-clay">Welcome, {account.firstName}</p>
          </Reveal>
        )}
        <Reveal delay={0.06}>
          <h2 className="font-edito text-4xl font-light leading-[1] tracking-tight md:text-6xl">
            Everything runs on Meals.
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-clay">
            <span className="text-carbon">1 Meal = 1 creative.</span> Chat, brand research, exports and
            redos are free — and new accounts get {FREE_TRIAL_IMAGES} free images to start.
          </p>
        </Reveal>

        {justPaid && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-8 max-w-md rounded-sm border border-linen bg-cream px-6 py-4"
          >
            <p className="text-[15px] text-carbon">Payment received — thank you.</p>
            <p className="mt-1 text-[13px] text-clay">
              Your Meals land within a few moments{snap ? ` — balance: ${Math.max(0, snap.balance)}` : ""}.{" "}
              <Link href="/choose" className="text-carbon underline underline-offset-4">Start creating →</Link>
            </p>
          </motion.div>
        )}
        {err && (
          <p className="mx-auto mt-6 max-w-md rounded-sm border border-carbon/30 bg-cream px-4 py-2.5 text-[13px] text-carbon">{err}</p>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl items-stretch gap-px overflow-hidden rounded-sm border border-linen bg-linen px-0 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((id, i) => {
          const p = PLANS[id];
          const featured = !!p.recommended;
          const buyable = PLAN_BUYABLE[id];
          const isCurrent = snap ? snap.plan === id : false;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] }}
              className={`group relative flex flex-col p-7 transition-colors duration-500 ${
                featured ? "bg-cream" : "bg-paper hover:bg-cream"
              }`}
            >
              {featured && (
                <span className="absolute right-5 top-6 text-[10px] uppercase tracking-[0.16em] text-carbon">Most popular</span>
              )}
              <div className="relative flex items-baseline justify-between">
                <h3 className="font-edito text-xl font-light tracking-tight text-carbon">{p.label}</h3>
                {isCurrent && (
                  <span className="rounded-full border border-linen px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-clay">Your plan</span>
                )}
              </div>
              <p className="relative mt-5 flex items-baseline gap-2">
                <span className="font-edito text-5xl font-light tracking-tight text-carbon">
                  {p.priceUSD === null ? "Free" : `$${p.priceUSD}`}
                </span>
                {p.priceUSD !== null && <span className="text-[13px] text-clay">/mo</span>}
              </p>
              <p className="relative mt-3 text-[11px] uppercase tracking-[0.14em] text-clay">
                {p.monthlyMeals > 0 ? `${p.monthlyMeals} Meals a month` : `${FREE_TRIAL_IMAGES} free images · ${FREE_TRIAL_DAYS} days`}
              </p>
              <p className="relative mt-4 flex-1 text-[14px] leading-relaxed text-clay">{p.blurb}</p>

              {id === "free" ? (
                <Link
                  href="/choose"
                  className="relative mt-7 rounded-full bg-carbon px-5 py-2.5 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-paper transition-colors duration-300 hover:bg-carbon/85"
                >
                  Start tasting
                </Link>
              ) : isCurrent ? (
                <button
                  onClick={openPortal}
                  className="relative mt-7 rounded-full border border-carbon/25 px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-carbon transition-colors duration-300 hover:bg-carbon hover:text-paper"
                >
                  Manage plan
                </button>
              ) : (
                <button
                  onClick={() => buy(buyable!)}
                  disabled={buying !== null}
                  className={`relative mt-7 rounded-full px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors duration-300 disabled:opacity-50 ${
                    featured ? "bg-carbon text-paper hover:bg-carbon/85" : "border border-carbon/25 text-carbon hover:bg-carbon hover:text-paper"
                  }`}
                >
                  {buying === buyable ? "Opening checkout…" : `Get ${p.label}`}
                </button>
              )}
            </motion.div>
          );
        })}
      </section>

      <p className="pb-16 pt-6 text-center text-[13px] text-clay">
        Already subscribed?{" "}
        <button onClick={openPortal} className="text-carbon underline underline-offset-4">Manage billing</button>{" "}
        — invoices, card, cancel any time.
      </p>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Reveal className="rounded-sm border border-linen bg-cream p-8 md:p-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <h3 className="font-edito text-2xl font-light tracking-tight text-carbon">Top-up packs</h3>
            <p className="text-[11px] uppercase tracking-[0.16em] text-clay">For the big shoot weeks · never expire</p>
          </div>
          <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-linen bg-linen sm:grid-cols-3">
            {TOPUP_PACKS.map((t) => {
              const buyable = PACK_BUYABLE[t.meals];
              return (
                <div key={t.meals} className="flex items-center justify-between bg-paper px-6 py-5 transition-colors duration-300 hover:bg-cream">
                  <div>
                    <span className="text-[15px] text-carbon">{t.meals} Meals</span>
                    <span className="ml-2 font-edito text-lg font-light text-clay">${t.priceUSD}</span>
                  </div>
                  <button
                    onClick={() => buy(buyable)}
                    disabled={buying !== null}
                    className="rounded-full bg-carbon px-4 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-paper transition-colors duration-300 hover:bg-carbon/85 disabled:opacity-50"
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
        </Reveal>
      </section>

      <section id="faq" className="scroll-mt-24 border-t border-linen">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="text-center font-edito text-4xl font-light tracking-tight text-carbon">Questions</h2>
          <div className="mt-10 divide-y divide-linen border-y border-linen">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] text-carbon">
                  {f.q}
                  <span className="text-clay transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-clay">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-10 text-center text-[14px] text-clay">
            Something else?{" "}
            <Link href="/contact" className="text-carbon underline-offset-4 hover:underline">Book a call</Link>{" "}
            — we&rsquo;ll walk you through it.
          </p>
        </div>
      </section>
    </div>
  );
}
