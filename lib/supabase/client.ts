import { createClient } from "@supabase/supabase-js";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// This sandboxed dev environment only allows outbound HTTPS through a local
// proxy, and Node's native fetch doesn't honor HTTPS_PROXY automatically
// (same fix every script under scripts/ already applies). No-op outside
// this environment, where the var is simply unset.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl && typeof window === "undefined") {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

// Public, browser-safe client. Relies on RLS ("public read" policies in
// 0001_initial_schema.sql) to scope what anonymous visitors can see --
// never pass the service role key to this client.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
