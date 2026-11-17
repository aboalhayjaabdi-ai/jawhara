/**
 * A fetch for Supabase clients that gives up after `ms` instead of waiting on a stuck database.
 * Without it, a database that stops answering made every page render, cart call and middleware
 * check hang until Vercel's 300 s function timeout (2026-11-17: the site "just loaded" for ~10
 * minutes). With it, a cached (ISR) page keeps being served while a refresh fails fast, and API
 * routes return an error the cart can show instead of spinning.
 */
export function fetchWithTimeout(ms: number): typeof fetch {
  // Plain AbortController + setTimeout (not AbortSignal.timeout/any) so it works in every runtime
  // this client is used in: Vercel functions, the middleware, and older Safari versions.
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Supabase request timed out after ${ms} ms`)), ms);
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
