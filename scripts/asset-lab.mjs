#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ASSET LAB — experiment with the asset-generation model directly.
// Sweeps model × quality × input_fidelity, generates REAL images, SAVES them so you can eyeball
// quality, and prints per-call + batch wall-clock so you can see the speed trade. Uses the same
// OpenAI images API path the app renders through (images.edit from your product image).
//
// USAGE
//   node scripts/asset-lab.mjs [--flags]
//
//   --image  PATH         product image to edit from (default: a sample from generated/)
//                         omit with --generate to do text-to-image instead of an edit
//   --prompt "..."        the scene prompt (default: a clean editorial product prompt)
//   --model  a,b,c        models to sweep  (default: gpt-image-1.5)
//                         try: gpt-image-1.5, gpt-image-1, gpt-image-1-mini
//   --quality low,medium,high        (default: high,medium,low)
//   --fidelity high,low              (default: high,low)   [binary — API rejects anything else]
//   --n  N                images per combo, rendered in parallel (default: 1)
//   --size WxH            e.g. 1024x1536 (portrait, default), 1024x1024, 1536x1024
//   --out  DIR           where to save images (default: scripts/asset-lab-out/)
//   --generate           text-to-image (no product image); input_fidelity is ignored
//
// EXAMPLES
//   node scripts/asset-lab.mjs --image ./my-product.png --n 3
//   node scripts/asset-lab.mjs --model gpt-image-1.5,gpt-image-1-mini --quality high,low --fidelity high,low
//   node scripts/asset-lab.mjs --generate --prompt "a minimalist perfume bottle on wet stone"
// ─────────────────────────────────────────────────────────────────────────────────────────────
import OpenAI, { toFile } from "openai";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ---- tiny flag parser ----
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true; // bare flag → true
};
const list = (name, def) => String(flag(name, def)).split(",").map((s) => s.trim()).filter(Boolean);

// ---- key from .env ----
const env = readFileSync(join(ROOT, ".env"), "utf8");
const envVal = (k) => (env.split("\n").find((l) => new RegExp(`^${k}=`).test(l)) || "").split("=").slice(1).join("=").trim();
const apiKey = envVal("OPENAI_API_KEY");
if (!apiKey) { console.error("✗ no OPENAI_API_KEY found in .env"); process.exit(1); }

const client = new OpenAI({ apiKey, timeout: 240_000, maxRetries: 2 });

// ---- config ----
const doGenerate = flag("generate", false) === true;
const models = list("model", envVal("OPENAI_IMAGE_MODEL") || "gpt-image-1.5");
const qualities = list("quality", "high,medium,low");
const fidelities = doGenerate ? ["-"] : list("fidelity", "high,low");
const N = Number(flag("n", "1")) || 1;
const size = String(flag("size", "1024x1536"));
const outDir = String(flag("out", join(HERE, "asset-lab-out")));
const prompt = String(flag("prompt",
  "Editorial product photograph of the attached product as the sole hero on a clean designed surface, one motivated soft light, real contact shadow, shallow depth of field, Kodak Portra colour. Keep the product's exact shape, label and every word of text unchanged."));

// pick a default product image if none given
let imagePath = flag("image", null);
if (!doGenerate && (!imagePath || imagePath === true)) {
  const gen = join(ROOT, "generated");
  const sample = readdirSync(gen).find((f) => /\.(png|jpe?g|webp)$/i.test(f));
  imagePath = sample ? join(gen, sample) : null;
  if (!imagePath) { console.error("✗ no --image given and no sample in generated/. Pass --image PATH or --generate."); process.exit(1); }
}
const imgBuf = doGenerate ? null : readFileSync(imagePath);

mkdirSync(outDir, { recursive: true });
const clamp = (f) => (f === "high" ? "high" : "low"); // API accepts only high|low

async function one(model, quality, fidelity, idx) {
  const t = Date.now();
  const tag = `${model}__q-${quality}__f-${fidelity}__${idx + 1}`;
  try {
    let data;
    if (doGenerate) {
      data = (await client.images.generate({ model, prompt, size, quality })).data?.[0];
    } else {
      const image = await toFile(imgBuf, "product.png", { type: "image/png" });
      const isMini = /mini/i.test(model);
      const params = { model, image, prompt, size, quality };
      if (!isMini && fidelity !== "-") params.input_fidelity = clamp(fidelity);
      data = (await client.images.edit(params)).data?.[0];
    }
    const ms = Date.now() - t;
    if (data?.b64_json) {
      const file = join(outDir, `${tag}.png`);
      writeFileSync(file, Buffer.from(data.b64_json, "base64"));
      return { tag, ms, ok: true, file };
    }
    if (data?.url) return { tag, ms, ok: true, remote: data.url };
    return { tag, ms, ok: false, err: "no image in response" };
  } catch (e) {
    return { tag, ms: Date.now() - t, ok: false, err: (e?.status ? e.status + " " : "") + (e?.message || e).toString().slice(0, 120) };
  }
}

// ---- run the sweep ----
console.log(`ASSET LAB`);
console.log(`  mode     : ${doGenerate ? "text-to-image (images.generate)" : `edit from ${basename(imagePath)}`}`);
console.log(`  models   : ${models.join(", ")}`);
console.log(`  quality  : ${qualities.join(", ")}`);
if (!doGenerate) console.log(`  fidelity : ${fidelities.join(", ")}`);
console.log(`  n/combo  : ${N}   size: ${size}   out: ${outDir}\n`);

const rows = [];
for (const model of models) {
  for (const quality of qualities) {
    for (const fidelity of fidelities) {
      const t = Date.now();
      const results = await Promise.all(Array.from({ length: N }, (_, i) => one(model, quality, fidelity, i)));
      const wall = ((Date.now() - t) / 1000).toFixed(1);
      const ok = results.filter((r) => r.ok).length;
      const times = results.map((r) => (r.ms / 1000).toFixed(1)).join(",");
      const errs = [...new Set(results.filter((r) => !r.ok).map((r) => r.err))];
      const label = `${model}  q=${quality}${fidelity !== "-" ? ` f=${fidelity}` : ""}`;
      console.log(`■ ${label.padEnd(42)} ${ok}/${N} ok · batch ${wall}s · per-call [${times}]s${errs.length ? `  ⚠ ${errs.join(" ; ")}` : ""}`);
      rows.push({ label, wall, ok });
    }
  }
}
console.log(`\n════ SUMMARY (batch wall-clock, ${N} parallel/combo) ════`);
for (const r of rows) console.log(`  ${r.label.padEnd(42)} ${r.wall}s  (${r.ok}/${N})`);
console.log(`\nImages saved to: ${outDir}`);
