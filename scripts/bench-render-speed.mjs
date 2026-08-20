// Wall-clock benchmark for the RENDER_SPEED tiers — run against a FUNDED OpenAI key.
//   node scripts/bench-render-speed.mjs [path-to-product-image.png]
//
// Times 6 gpt-image-1.5 edits IN PARALLEL at each tier and prints the batch wall-clock.
// input_fidelity is binary (high|low); quality is low|medium|high. The tiers mirror lib/image.ts:
//   OLD default   → high quality / high fidelity   (what a shoot used to pay on every grid shot)
//   NEW balanced  → medium quality / low fidelity  (the new default — parallel-fast)
//   FAST          → low quality  / low fidelity    (draft grade, fastest)
import OpenAI, { toFile } from "openai";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = (k) => (env.split("\n").find((l) => new RegExp(`^${k}=`).test(l)) || "").split("=").slice(1).join("=").trim();
const apiKey = line("OPENAI_API_KEY");
const MODEL = line("OPENAI_IMAGE_MODEL") || "gpt-image-1.5";
if (!apiKey) { console.error("no OPENAI_API_KEY in .env"); process.exit(1); }

const client = new OpenAI({ apiKey, timeout: 240_000, maxRetries: 2 });
const N = 6;
const size = "1024x1536";
const prompt =
  "Editorial product photograph of the attached product as the sole hero on a clean designed surface, one motivated soft light, real contact shadow, shallow depth of field, Kodak Portra colour. Keep the product's exact shape, label and every word of text unchanged.";
const imgPath = process.argv[2] || new URL("../generated/1782501643506-4-gy4m4.png", import.meta.url).pathname;
const imgBuf = readFileSync(imgPath);

async function oneEdit(quality, fidelity) {
  const image = await toFile(imgBuf, "product.png", { type: "image/png" });
  const t = Date.now();
  try {
    const r = await client.images.edit({ model: MODEL, image, prompt, size, quality, input_fidelity: fidelity });
    return { ok: !!r.data?.[0], ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, err: (e?.status ? e.status + " " : "") + (e?.message || e).toString().slice(0, 100) };
  }
}
async function batch(label, quality, fidelity) {
  const t = Date.now();
  const results = await Promise.all(Array.from({ length: N }, () => oneEdit(quality, fidelity)));
  const wall = ((Date.now() - t) / 1000).toFixed(1);
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n■ ${label}  (quality=${quality}, input_fidelity=${fidelity})`);
  console.log(`   ${N} in parallel → BATCH WALL-CLOCK ${wall}s   |   ${ok}/${N} ok   |   per-call [${results.map((r) => (r.ms/1000).toFixed(1)).join(", ")}]s`);
  const errs = [...new Set(results.filter((r) => r.err).map((r) => r.err))];
  if (errs.length) console.log(`   errors: ${errs.join(" ; ")}`);
  return { label, wall, ok };
}

console.log(`Model ${MODEL} · ${N} parallel · ${size} · image ${imgPath}`);
const s = [];
s.push(await batch("OLD default  high / high ", "high", "high"));
s.push(await batch("NEW balanced medium / low", "medium", "low"));
s.push(await batch("FAST         low / low   ", "low", "low"));
console.log("\n════ SUMMARY — 6 images, wall-clock ════");
for (const x of s) console.log(`  ${x.label}  ${x.wall}s  (${x.ok}/${N} ok)`);
