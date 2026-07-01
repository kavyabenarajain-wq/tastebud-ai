/**
 * Minimal Replicate client — runs an open-source model and returns its output.
 * Provider-gated: everything is a no-op unless REPLICATE_API_TOKEN is set, so the
 * app keeps working on Gemini alone and these enhancers light up when the key lands.
 *
 * We talk to the REST predictions API directly (no SDK) and poll to completion.
 * Model identifiers are env-configurable so you can pin/swap versions without code.
 */

const API = "https://api.replicate.com/v1";

export function replicateEnabled(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RunOpts = { pollMs?: number; timeoutMs?: number };

/**
 * Run a model and return its raw output. `model` is either:
 *   - a pinned version hash: "<64-hex>"  → POST /predictions {version}
 *   - an "owner/name" or "owner/name:version" slug → POST /models/<owner>/<name>/predictions
 * Returns whatever the model outputs (string URL, string[], or object).
 */
export async function runReplicate(model: string, input: Record<string, unknown>, opts: RunOpts = {}): Promise<unknown> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "wait" };

  // Decide the endpoint + body shape from the identifier.
  let url: string;
  let body: Record<string, unknown>;
  if (/^[0-9a-f]{40,}$/i.test(model)) {
    url = `${API}/predictions`;
    body = { version: model, input };
  } else if (model.includes(":")) {
    url = `${API}/predictions`;
    body = { version: model.split(":")[1], input };
  } else {
    const [owner, name] = model.split("/");
    url = `${API}/models/${owner}/${name}/predictions`;
    body = { input };
  }

  let pred = await (await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })).json();
  if (pred?.error) throw new Error(`Replicate error: ${pred.error}`);

  // With prefer:wait the prediction often returns already-terminal; otherwise poll.
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
  while (pred?.status && !["succeeded", "failed", "canceled"].includes(pred.status)) {
    if (Date.now() > deadline) throw new Error("Replicate timed out");
    await sleep(opts.pollMs ?? 1500);
    pred = await (await fetch(`${API}/predictions/${pred.id}`, { headers: { authorization: `Bearer ${token}` } })).json();
  }
  if (pred?.status !== "succeeded") throw new Error(`Replicate ${pred?.status ?? "unknown"}: ${pred?.error ?? "no output"}`);
  return pred.output;
}

/** Coerce Replicate output (URL string, array of URLs, or {image} object) to a single URL. */
export function firstUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const s = output.find((x) => typeof x === "string");
    if (s) return s as string;
  }
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of ["image", "output", "url"]) if (typeof o[k] === "string") return o[k] as string;
  }
  throw new Error("Replicate returned no image URL");
}
