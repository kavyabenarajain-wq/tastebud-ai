# Dormant machinery — the freeze list

**Discipline:** everything below is **built but switched off**. It is a maintenance tax, not a feature,
until cohort one (five founders) loves the core loop. **Do not invest more here** — no polish, no
follow-ups, no "while I'm in there" — unless a real cohort-one need pulls it live. When you *do* light
one up, flip its flag, test it against ONE brand, then delete its row from this file.

Everything is gated by an env var (or the absence of a key). Default state = OFF. Nothing here changes
production behavior until the gate is set.

---

## ⚠️ One coupling to know before you touch Replicate
Setting **`REPLICATE_API_TOKEN`** does two things at once: it enables the enhancers **and** reroutes the
**main renderer** to Replicate FLUX-Kontext (`lib/image.ts` `activeRenderer()`). So "turn on the token
for cutouts" silently changes how *everything* renders. The new `PRODUCT_COMPOSITE` flag is deliberately
independent of this, but the cutout itself still needs the token — so enabling compositing means
accepting the renderer reroute unless you first decouple `activeRenderer()` behind an explicit
`IMAGE_PROVIDER`/render flag.

---

## Billing & payments (all dormant)
| Feature | Gate (env) | Status |
|---|---|---|
| Billing core (identity + grants) | `lib/billing.ts` — 503s until `supabaseConfigured()` | Logic active, refuses until sign-in configured |
| Dodo payments | `DODO_PAYMENTS_API_KEY` (+ `DODO_ENVIRONMENT`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_*`) | Checkout/portal return 503 when unset |
| Meals pricing table | `lib/meals.ts` | Data (previews) active; money side dormant |
| Credits / ledger | `CREDITS_ENFORCED=1` | **Observe mode** by default — writes the ledger, never refuses |
| Co-pilot affordability gate | (same `CREDITS_ENFORCED`) | No-op in prod; blocks only when enforced |
| Meals admin backdoor / owner exemption | `MEALS_ADMIN_SECRET`, `MEALS_OWNER_EMAIL` | 404 until secret set |

## Memory
| Feature | Gate (env) | Status |
|---|---|---|
| Supermemory external layer | `SUPERMEMORY_API_KEY` (+ `SUPERMEMORY_BASE_URL`) | Every call no-ops without the key |
| `learnedPreferences` (distilled taste v2) | — (`lib/types.ts`, reserved field) | Unused placeholder |

## Renderers & enhancers
| Feature | Gate (env) | Status |
|---|---|---|
| Higgsfield renderer (intended default) | `HIGGSFIELD_API_KEY` | Stub throws until configured |
| Replicate open-source path (FLUX main renderer + upscale/cutout/relight/edit) | `REPLICATE_API_TOKEN` (+ `REPLICATE_*` model overrides) | Dormant. **Note the renderer-reroute coupling above.** |
| Anthropic orchestrator brain | `ANTHROPIC_API_KEY` | Falls back to Azure/OpenAI when unset |
| OpenRouter image renderer | `OPENROUTER_API_KEY` / `OPENROUTER_IMAGE_MODEL` | Dormant |
| Gemini "restage" renderer | `RESTAGE_RENDERER=gemini` | Off by default |
| Azure image deployment | `AZURE_IMAGE_DEPLOYMENT` | Dormant unless set |
| Google Veo (video) | `GOOGLE_VEO_API_KEY` | **Placeholder — not referenced in code at all** |

## Quality switches added 2026-07-31 (default OFF by design)
| Feature | Gate (env) | What it does |
|---|---|---|
| **QC gate** | `QC_GATE=1` | Makes the existing vision judge authoritative: a shot that fails QC on every attempt is dropped (+ Meal refunded) instead of shipped with a soft "drift" badge. Tune retries with `QC_MAX_ATTEMPTS`. |
| **Product-cutout compositing** | `PRODUCT_COMPOSITE=1` (also needs `REPLICATE_API_TOKEN`) | Composites the client's REAL product cutout onto the rendered scene to guarantee fidelity. v1: hero/packshot angles only. |

## Render tunables (not gates — safe to adjust)
`IMAGE_PROVIDER`, `RENDER_CONCURRENCY`, `QC_MAX_ATTEMPTS`, `OPENAI_IMAGE_QUALITY`,
`OPENAI_INPUT_FIDELITY`, `FINISH_TARGET_LONG_EDGE`.

---

## Wired but awaiting a second step (NOT dormant — active, just incomplete)
These run today; they just have one more hop before they're fully useful:
- **Kill-log `reason` / `failed_bar`** — the `kill_log` table records every keep/reject/hero now, but the
  `reason` and `failed_bar` columns stay null until the reject UI captures a "why". (`lib/store/killLog.ts`)
- **Brain snapshot restore** — `restoreBrainSnapshot()` works, but there's no UI/route to browse and
  roll back a brain yet. (`lib/store/brainSnapshots.ts`)
