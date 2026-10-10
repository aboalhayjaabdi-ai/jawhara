import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Server-only -- never import from a "use client" component (same split as lib/supabase/client.ts).
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/server-auth.ts must never be imported into client code");
}

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

/**
 * A request-scoped, cookie-bound Supabase client carrying the signed-in admin's own session
 * (anon key -- RLS still applies, via is_admin() checking admin_users against auth.uid()). Must
 * be created fresh per request/render, never cached or shared across requests.
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies (no response to attach to) --
          // the middleware below is what actually refreshes the session in that case.
        }
      },
    },
  });
}
