import { waitUntil } from "@vercel/functions";

/**
 * Run a promise as BACKGROUND work that reliably completes AFTER the response is sent, without
 * blocking it. On Vercel serverless a function freezes at response-flush, so a bare `void promise`
 * fired right before `return` is silently dropped — which is exactly what would kill the memory
 * capture in prod. `waitUntil` extends the invocation until the promise settles.
 *
 * Outside a Vercel request scope (local `next dev`, tests) `waitUntil` is a harmless no-op and the
 * long-lived process drains the promise anyway — so this is safe everywhere. Errors are swallowed:
 * background memory work must never surface as an unhandled rejection.
 */
export function background(p: Promise<unknown> | null | undefined): void {
  if (!p) return;
  const safe = Promise.resolve(p).catch(() => {});
  try {
    waitUntil(safe);
  } catch {
    /* not in a serverless request scope — the promise still runs to completion in-process */
  }
}
