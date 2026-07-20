/**
 * Meals — Tastebud's usage currency. 1 Meal = 1 delivered image.
 *
 * The whole pricing model lives in this one const table so it is reviewable, versioned, and
 * renders on /pricing without NEXT_PUBLIC_ plumbing. CLIENT-SAFE by design: no imports from
 * lib/store (which pulls in the pg driver) — workspace pages import this for cost previews.
 *
 * Unit economics (verified call-trace, July 2026): one delivered image costs ≈ $0.40 all-in —
 * gpt-image-1.5 render (high quality, high input-fidelity) ≈ $0.25, QC vision ≈ $0.02,
 * amortized art-direction + vision pre-passes ≈ $0.05, expected QC re-renders ≈ $0.08.
 * QC retries are NEVER charged to the user: you pay per plated dish, not per attempt in the
 * kitchen. The same principle extends to SATISFACTION redos — a shot the customer isn't happy
 * with re-shoots free (see FREE_REDOS_PER_SHOT), because they already paid for that dish.
 * Retail anchor ≈ $1.75/Meal → ~80% gross margin at typical utilization, with the worst-typical
 * raw-cost basis itself carrying ~15% buffer against provider price hikes (which now also
 * absorbs a budgeted number of free redos per delivered image).
 */

export type PlanId = "free" | "starter" | "pro" | "studio";

/** What each metered action costs, in Meals. Chat, research, exports and reformats are free. */
export const MEAL_COSTS = {
  image: 1,    // one delivered image from any shoot/campaign (product, model, post, story, carousel frame, ad placement)
  upscale: 1,  // true-4K upscale of a keeper
  enhance: 1,  // relight / edit / cutout on a shot
} as const;

/**
 * Satisfaction redos are FREE. You pay for the plated dish, not for us to get it right — so a
 * shot you're not happy with can be re-shot without spending another Meal.
 *
 * Each delivered shot carries this many free one-click "Redo"s (a blind re-roll of the SAME
 * angle). The cap only bounds the cheap-to-spam slot-machine case; once it's reached the UI
 * escalates from "Redo" to a DIRECTED chat refine ("make the light warmer", "shoot it on
 * marble") — a better outcome, and free too because it costs the customer a sentence of intent,
 * so it can't be spammed. What DOES cost Meals is changing the ENTIRE thing: a new brief or a
 * fresh full shoot is new work and charges per delivered image as normal.
 *
 * Env-overridable server-side (MEALS_FREE_REDOS) so the policy is a knob, not a rebuild.
 */
export const FREE_REDOS_PER_SHOT = 3;

/** True while this redo of a shot is still inside its free allowance. `redoIndex` is 0-based —
 *  the 1st redo is index 0, so indices 0..FREE_REDOS_PER_SHOT-1 are free. */
export const isRedoFree = (redoIndex: number): boolean => redoIndex < FREE_REDOS_PER_SHOT;

/**
 * Free trial — a one-time taste of the studio for a NEW free account: FREE_TRIAL_IMAGES delivered
 * images, usable only within the first FREE_TRIAL_DAYS days of signup. This is NOT a daily drip and
 * is NOT granted to paid plans — Starter / Chef's Table / Banquet get their monthly Meals only.
 * Unused trial Meals expire the moment the window closes (use-it-in-3-days-or-lose-it). Env-
 * overridable server-side (MEALS_FREE_TRIAL_IMAGES / MEALS_FREE_TRIAL_DAYS).
 */
export const FREE_TRIAL_IMAGES = 2;
export const FREE_TRIAL_DAYS = 3;

export const PLANS: Record<PlanId, { label: string; monthlyMeals: number; priceUSD: number | null; blurb: string; recommended?: boolean }> = {
  free:    { label: "Tasting",      monthlyMeals: 0,   priceUSD: null, blurb: `${FREE_TRIAL_IMAGES} free images to try the studio — your first ${FREE_TRIAL_DAYS} days.` },
  starter: { label: "Starter",      monthlyMeals: 20,  priceUSD: 29,   blurb: "For a founder shooting a campaign a week." },
  pro:     { label: "Chef's Table", monthlyMeals: 60,  priceUSD: 79,   blurb: "For brands shipping content every day.", recommended: true },
  studio:  { label: "Banquet",      monthlyMeals: 170, priceUSD: 199,  blurb: "For teams and agencies running many brands." },
};

/** One-time Meal packs. Never expire. */
export const TOPUP_PACKS = [
  { meals: 10,  priceUSD: 19 },
  { meals: 30,  priceUSD: 49 },
  { meals: 100, priceUSD: 139 },
] as const;

/** Meals for an image count — the only formula the UI needs for previews. */
export const mealsForImages = (n: number): number => Math.max(0, n) * MEAL_COSTS.image;
