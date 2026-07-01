---
name: run-studio
description: Run and verify the Tastebud Asset Studio locally — start the Next dev server and drive the /studio/create unified workspace (product + model). Use when asked to run the app, screenshot the studio, or confirm a studio/onboarding change works in a real browser.
---

# Run & verify the Asset Studio

## Start the dev server
`npm run dev` (Next 14). Default port **3000 — but if 3000 is busy it silently falls back to 3001**, so read the startup log and target the port it actually printed. Poll the port, don't `sleep` (macOS has no `timeout`):

```bash
npm run dev            # run in background
for i in $(seq 1 60); do curl -sf http://localhost:3001 >/dev/null 2>&1 && { echo up; break; }; sleep 1; done
```

Stop it by port so you don't kill a second (user's) server: `kill $(lsof -ti tcp:3001)`. **Never** `pkill -f 'next dev'`.

## Quick smoke — no browser, safe, free
Force-compile the route and confirm it renders instead of 500ing:

```bash
curl -s -o /tmp/c.html -w "%{http_code}\n" http://localhost:3001/studio/create
grep -oE '>Product<|>Model<|Message your creative director' /tmp/c.html
```

`200` + those markers = the route compiles and the workspace shell renders (default = **product** mode, 2-column `360px minmax(0,1fr)` layout, middle panel hidden).

## The workspace needs a brand in localStorage
`/studio/create` (and the product/model pages) redirect to `/studio` unless `localStorage["cc.activeBrand"]` holds a brand brain. Minimal valid seed:

```json
{"name":"Aurelia","uses":["Product photoshoots","Model photoshoots","Instagram carousels"],
 "catalog":[{"id":"p1","name":"Serum","images":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"]}],
 "selectedProductIds":["p1"]}
```

`uses` drives the creative-type **filter bar** (product/model chips; other picks show as disabled "soon"). Seeded + selected products auto-load into the shoot.

## Full browser drive (Playwright)
No browser ships in this env. Install Playwright + Chromium, then drive headless: set localStorage via `context.addInitScript(fn, JSON.stringify(brain))` **before** `page.goto('…/studio/create')`. Verify: product mode renders → click the `Model` filter chip (`getByRole('button',{name:'Model',exact:true})`) → assert `Your model` appears (studio column swaps in) **and the chat thread persists** across the switch → screenshot each → assert `console` errors are empty. Run the driver from the **project root** (ESM resolves node_modules from the script's dir), screenshots to the scratchpad. Don't fire a real shoot (see Don't).

### ⚠ npm landmine in this repo — READ BEFORE ANY `npm install`
`npm install <anything>` here triggers an npm **dedup** that hoists `@swc/helpers` out of `node_modules/next/node_modules/` → the Next compiler then throws `MODULE_NOT_FOUND: @swc/helpers` and **every route 500s**. Also, npm writes fail with `Invalid Version` unless you pass `--no-package-lock`. Safe install + repair:

```bash
npm i --no-save --no-package-lock playwright@1.49.1     # avoids both the write bug and package.json churn
node_modules/.bin/playwright install chromium
cp -R node_modules/@swc/helpers node_modules/next/node_modules/@swc/helpers   # repair the dedup break
```

The first route hit after the repair may still 500 from webpack cache; the next request recompiles clean. Remove Playwright when done (manual `rm`, not `npm rm`, to avoid re-triggering dedup): `rm -rf node_modules/playwright node_modules/playwright-core node_modules/.bin/playwright*`.

## Don't
- **Don't fire a real generation to "verify."** `.env` holds live Azure + Gemini keys; a shoot costs money. `/api/generate` is shared with the shipped product/model workspaces — verifying the UI shell (render + filter swap + thread persistence + clean console) is enough for UI changes.
- **Don't delete the legacy routes** (`/studio/choose`, `/studio/product`, `/studio/model`) without a commit first — the repo has no git history, so they're the only diff reference for the unified merge.
