"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { activeAccount } from "@/lib/account";

/**
 * Meals balance pill — lives in the WorkBar's right slot. 1 Meal = 1 creative. Fetches
 * /api/meals on mount (which also lands the day's free drip), and re-fetches whenever
 * anything dispatches the "meals:refresh" window event (see refreshMeals). Monochrome
 * chip, matching the WorkBar brand chip — the UI recedes, the work is the only colour.
 */

/** Ask every mounted pill to re-fetch (fire after a shoot / upscale / enhance). */
export function refreshMeals(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("meals:refresh"));
}

export function MealsPill() {
  const [balance, setBalance] = useState<number | null>(null);
  const [drip, setDrip] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const { email } = activeAccount();
      return fetch(`/api/meals${email ? `?account=${encodeURIComponent(email)}` : ""}`)
        .then((r) => r.json())
        .then((j) => { if (alive && typeof j.balance === "number") { setBalance(j.balance); setDrip(j.drip?.amount ?? 0); } })
        .catch(() => {});
    };
    load();
    window.addEventListener("meals:refresh", load);
    return () => { alive = false; window.removeEventListener("meals:refresh", load); };
  }, []);

  if (balance === null) return null; // hidden until the first fetch resolves
  const shown = Math.max(0, balance); // observe-mode negatives never show
  return (
    <Link
      href="/pricing"
      title={`1 Meal = 1 creative. ${drip} free Meals arrive daily (midnight UTC).`}
      className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-opacity hover:opacity-60"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink" />
      {shown} Meal{shown === 1 ? "" : "s"}
    </Link>
  );
}
