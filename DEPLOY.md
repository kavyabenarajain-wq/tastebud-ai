# Deploying Tastebud to Vercel

The production build passes. The items below are what pass `next build` but break at
**runtime** on serverless, plus the external-service config. Do them in order.

## Plan requirement — Vercel **Pro**
Seven API routes declare `maxDuration` above Hobby's 60s ceiling (`generate` & `backbrain` = 300s,
`enhance`/`upscale` = 180s, `clarify`/`reformat`/`research` = 120s). On Hobby these are capped at
60s and a real multi-shot shoot is truncated mid-generation. **Deploy on Pro.**

## Region
`vercel.json` pins functions to `sin1` (Singapore) to co-locate with the Supabase Postgres
database in `ap-southeast-1` — otherwise every DB query pays a cross-ocean round-trip.

## 1 — Vercel Storage: Blob (required)
Every rendered image is persisted via `@vercel/blob` in `lib/storage.ts`; with no Blob store it
falls back to writing local disk, which is **read-only** on Vercel → all generation fails.
→ **Storage → Blob → create + connect.** Injects `BLOB_READ_WRITE_TOKEN` automatically.

## 2 — Environment variables (Settings → Environment Variables)
`.env` is gitignored — nothing carries over. Set all of it, with these prod-specific values:

| Var | Value for prod |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler**: `…pooler.supabase.com:6543/postgres?pgbouncer=true` (NOT the 5432 session pooler, NOT the IPv6-only direct host) |
| `PG_POOL_MAX` | `3` (Vercel scales horizontally; keep each instance's pool tiny) |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` (fill in after first deploy, then redeploy) |
| `BLOB_READ_WRITE_TOKEN` | auto-injected by connecting Blob (step 1) |

Public (client-inlined): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SCHEDULER_URL`.
Server config: `IMAGE_PROVIDER`, `OPENAI_IMAGE_MODEL`, `OPENAI_MODEL`, `GEMINI_IMAGE_MODEL`,
`OPENROUTER_IMAGE_MODEL`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_ENDPOINT`, `CREDITS_ENFORCED` (`1`
to enforce Meals), `MEALS_OWNER_EMAIL`.
Secrets (never `NEXT_PUBLIC_`): `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_VEO_API_KEY`,
`OPENROUTER_API_KEY`, `AZURE_OPENAI_API_KEY`, `MEALS_ADMIN_SECRET`.

## 3 — Supabase (Authentication → URL Configuration)
- **Site URL:** `https://<your-domain>`
- **Redirect URLs:** add `https://<your-domain>/auth/callback` (keep `http://localhost:3000/**` for dev).

Google Cloud OAuth redirect URI does **not** change — it points at Supabase, not the app.
Rotate the Supabase DB password if it was ever shared.

## 4 — Dodo payments
Test mode first, then live:
1. Dodo dashboard (matching `DODO_ENVIRONMENT`) → Webhooks → endpoint `https://<your-domain>/api/billing/webhook`;
   subscribe to `payment.succeeded` + the `subscription.*` events. Copy the signing secret →
   `DODO_WEBHOOK_SECRET`. **Without this the webhook 401s every event and grants zero Meals.**
2. Set the six `DODO_PRODUCT_*` ids (code falls back to placeholder test ids otherwise).
3. Going live: complete Dodo KYC, create live products, set `DODO_ENVIRONMENT=live_mode` + live API
   key + live product ids + live webhook secret. **Align prices** — the Dodo product price is what's
   charged (currently Chef's Table $70 / 100-Meals $100 vs the app's $79 / $139).
4. Verify: GET `https://<your-domain>/api/billing/checkout` prints each product's live Dodo name+price.

## 5 — Deploy order
Pro → env vars (with the pooler URL) → deploy → grab the domain → set `NEXT_PUBLIC_APP_URL` +
Supabase URLs + Dodo webhook → redeploy → test **sign-in**, then a **generation**, then a **test payment**.
