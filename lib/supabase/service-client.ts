import { createClient } from "@supabase/supabase-js";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Server-only, service-role client. Bypasses RLS -- this is required and correct for
// checkout/webhook writes: orders/payments/discount_redemptions/webhook_events have no
// anon/authenticated insert policy (see supabase/migrations/0001_initial_schema.sql),
// by design, since only server-verified payment events should ever create them.
// NEVER import this file from a "use client" component -- SUPABASE_SERVICE_ROLE_KEY
// must never reach the browser bundle.
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/service-client.ts must never be imported into client code");
}

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

export const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
