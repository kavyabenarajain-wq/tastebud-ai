import type { BrandProfile, ShotCompliance } from "./types";

/**
 * Compliance-on-asset (Phase 2). Mints one structured ShotCompliance from data the
 * pipeline already computes — brand do-not, the industry playbook, the per-shot plan
 * negatives, palette and observed product colours — so the rules can RIDE WITH the
 * asset and be re-injected on every downstream op (reshoot, edit, relight, resize),
 * instead of only gating the first planner prompt. Pure + deterministic, no I/O.
 */

const PRODUCT_LOCK_INTENT =
  "Reproduce the product EXACTLY as in the reference — identical shape, silhouette, proportions, cap/closure, label, logo, every word of text, colours and materials. Never restyle, relabel, recolour, reshape or reinvent it; only the scene around it may change.";

const MODEL_LOCK_INTENT =
  "Keep the model's likeness and the product exactly as established — same person (never beautified away), same product (shape, label, every word of text, colours). Only re-light, re-dress or re-stage; never alter the person's identity or the product.";

/** Lenient extraction of do-not / avoid lines from an industry playbook's markdown. */
function extractIndustryDoNot(content?: string): string[] {
  if (!content) return [];
  const out: string[] = [];
  for (const raw of content.split("\n")) {
    const t = raw.replace(/^[-*>#\d.\s]+/, "").trim();
    if (t.length < 5 || t.length > 120) continue;
    if (/\b(avoid|never|don['’]?t|do not|no )\b/i.test(t)) out.push(t);
  }
  return Array.from(new Set(out)).slice(0, 8);
}

export function buildCompliance(args: {
  profile: BrandProfile;
  industry?: { label: string; content: string } | null;
  planNegatives?: string[];
  observedColors?: { name: string; hex: string; role?: string }[];
  isModel?: boolean;
}): ShotCompliance {
  const doNot = Array.from(
    new Set(
      [
        ...(args.profile.doNot ?? []),
        ...extractIndustryDoNot(args.industry?.content),
        ...(args.planNegatives ?? []),
      ]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, 16);

  const palette = (args.profile.palette ?? []).map((c) => [c.hex, c.name].filter(Boolean).join(" ")).filter(Boolean);
  const rb = (args.profile.rulebook ?? {}) as Record<string, unknown>;
  const aesthetic = typeof rb.aesthetic === "string" ? rb.aesthetic.trim() : "";
  const observed = (args.observedColors ?? []).map((c) => [c.hex, c.name].filter(Boolean).join(" ")).filter(Boolean);
  const brandLock = Array.from(new Set([...palette, ...observed, aesthetic].filter(Boolean))).slice(0, 12);

  return {
    doNot,
    productLock: args.isModel ? MODEL_LOCK_INTENT : PRODUCT_LOCK_INTENT,
    brandLock,
    appliedAt: new Date().toISOString(),
  };
}

/** The do-not list to feed as extra renderer negatives on any (re)render of this shot. */
export function complianceToNegatives(c?: ShotCompliance): string[] {
  return c?.doNot ?? [];
}

/**
 * A compact constraint tail appended to an instruction-edit / relight prompt, so the
 * brand's do-not and product-lock carry through the edit (FLUX Kontext / IC-Light bypass
 * the renderer, so without this an edit could quietly reintroduce a banned element).
 */
export function complianceTail(c?: ShotCompliance): string {
  if (!c) return "";
  const parts: string[] = [`\n\nHARD BRAND CONSTRAINTS — keep the product EXACTLY as-is: ${c.productLock}`];
  if (c.doNot.length) parts.push(`Do NOT: ${c.doNot.slice(0, 8).join("; ")}.`);
  if (c.brandLock.length) parts.push(`Stay within the brand's world: ${c.brandLock.slice(0, 8).join(", ")}.`);
  return parts.join(" ");
}
