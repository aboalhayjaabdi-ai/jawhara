import Stripe from "stripe";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Server-only. STRIPE_SECRET_KEY must never reach a client bundle -- never import this
// file from a "use client" component.
if (typeof window !== "undefined") {
  throw new Error("lib/stripe/server.ts must never be imported into client code");
}

// This sandboxed dev environment only allows outbound HTTPS through a proxy, which only
// Node's global fetch (undici) respects -- Stripe's SDK defaults to its own NodeHttpClient
// (the plain node:https module), which bypasses the proxy entirely and fails DNS resolution
// (confirmed via a real synthetic-webhook test: "getaddrinfo ENOTFOUND api.stripe.com").
// Forcing the fetch-based http client, after installing the same proxy dispatcher the
// Supabase clients use, fixes this. Harmless in real production hosting (e.g. Vercel), where
// there is no such proxy and fetch just goes straight out.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

// Lazily constructed: a route module importing this file must not throw at build/collect-page-data
// time just because the secret isn't configured yet locally -- only an actual attempt to use the
// client (a real request) should fail if the key is missing.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing required env var STRIPE_SECRET_KEY");
  // Stripe's SDK always sets its own computed Content-Length header; undici's fetch (used via
  // the proxy's ProxyAgent) recomputes that from the actual body and rejects a conflicting
  // explicit one with "invalid content-length header" (UND_ERR_INVALID_ARG). Stripping it and
  // letting fetch compute its own fixes this -- confirmed via a real synthetic-event test.
  const proxiedFetch: typeof fetch = (input, init) => {
    if (init?.headers) {
      const headers = new Headers(init.headers as HeadersInit);
      headers.delete("Content-Length");
      init = { ...init, headers };
    }
    return fetch(input, init);
  };

  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(proxiedFetch),
  });
  return _stripe;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
