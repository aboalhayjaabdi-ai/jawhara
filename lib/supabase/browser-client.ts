"use client";

import { createClient } from "@supabase/supabase-js";

// Browser-only client -- deliberately has NO undici/proxy setup (that's Node-only
// plumbing this sandboxed dev container needs for server-side fetches; bundling it
// into client components breaks webpack, since undici pulls in node:assert etc).
// Real browsers always have normal networking, so no proxy workaround is needed here.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
