import type { NextRequest } from "next/server";
import { enhanceEnabled, removeBackground, relight, editImage, upscale } from "@/lib/enhance";
import { complianceTail } from "@/lib/compliance";
import { qcImage } from "@/lib/image";
import type { ShotCompliance } from "@/lib/types";
import { ensureGrants, charge, refund, normalizeAccount, DEFAULT_ACCOUNT } from "@/lib/store";
import { MEAL_COSTS } from "@/lib/meals";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  action: "cutout" | "relight" | "edit" | "upscale";
  src: string;
  prompt?: string;
  face?: boolean;
  compliance?: ShotCompliance; // the shot's stored rules — re-applied so the edit stays on-brand
  productRef?: string; // the original product image, for the post-edit fidelity re-check
  brand?: string;
  redo?: boolean; // a directed satisfaction refine of an already-paid shot — free, not charged (see lib/meals)
  account?: string; // the signed-in email — bills that ledger; absent → shared default bucket
};

// Capability probe — the UI shows enhancer buttons only when this is enabled.
export async function GET() {
  return Response.json({ enabled: enhanceEnabled() });
}

// Open-source creative enhancers (Replicate). One route, switched by `action`.
export async function POST(req: NextRequest) {
  const { action, src, prompt, face, compliance, productRef, brand, redo, account: rawAccount } = (await req.json()) as Body;
  if (!src) return Response.json({ error: "no src" }, { status: 400 });
  if (!enhanceEnabled()) return Response.json({ error: "Enhancers are off — set REPLICATE_API_TOKEN to enable." }, { status: 503 });
  // MEALS — an enhancer pass costs 1. Observe mode records it; enforced mode refuses at zero.
  // A directed satisfaction refine (`redo:true`, an "edit" from the chat refine after a shot's
  // free redos) is FREE — fixing a dish you already bought never costs another Meal.
  const account = normalizeAccount(rawAccount) ?? DEFAULT_ACCOUNT;
  await ensureGrants(account).catch(() => {});
  const freeRefine = redo === true && action === "edit";
  const meal = freeRefine
    ? { ok: true as const, balance: 0 }
    : await charge(account, MEAL_COSTS.enhance, `enhance:${action}`).catch(() => ({ ok: true, balance: 0 }));
  if (!meal.ok) return Response.json({ error: "Out of Meals — 3 free Meals arrive daily, or top up on the pricing page." }, { status: 402 });
  const tail = complianceTail(compliance);
  try {
    let url: string;
    switch (action) {
      case "cutout": url = await removeBackground({ src }); break;
      case "relight": url = await relight({ src, prompt: prompt || "natural, soft, motivated studio light, consistent with the scene", constraints: tail }); break;
      case "edit": url = await editImage({ src, instruction: prompt || "", constraints: tail }); break;
      case "upscale": url = await upscale({ src, scale: 4, faceEnhance: !!face }); break;
      default: return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
    // Post-edit compliance re-check (best-effort, non-blocking): did the edit drift off the
    // product/do-not? Reuses qcImage — no new QC model. Only when we have the original + rules.
    let drift = false;
    let driftReasons: string[] = [];
    if (compliance && productRef && (action === "edit" || action === "relight")) {
      const verdict = await qcImage({ url, checklist: compliance.doNot, brand: brand || "the brand", productRef });
      drift = !verdict.pass;
      driftReasons = verdict.reasons;
    }
    return Response.json({ url, drift, driftReasons });
  } catch (err) {
    await refund(account, MEAL_COSTS.enhance, `refund:enhance:${action}`).catch(() => {});
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
