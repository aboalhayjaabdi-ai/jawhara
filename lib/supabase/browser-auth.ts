import { createBrowserClient } from "@supabase/ssr";

// Pure browser client, no Node-only imports -- same reason lib/supabase/browser-client.ts exists
// (importing the server client into a "use client" component broke webpack once already).
export function createAuthBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
