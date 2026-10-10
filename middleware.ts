import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Requires the Node.js runtime (see next.config.mjs's experimental.nodeMiddleware) -- the default
// Edge runtime can neither bundle undici nor have its fetch proxied this way.
export const runtime = "nodejs";

// Middleware runs server-side and calls Supabase's auth endpoint directly (getUser() revalidates
// the JWT against Supabase, unlike getSession()'s purely-local decode) -- needs the same
// environment proxy every other server-side fetch in this project requires.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

// Refreshes the session cookie on every request and gates /admin/* on being signed in at all.
// This is the "authenticated" check only; the authoritative "is actually an admin" check (via
// is_admin()/admin_users) happens in app/admin/layout.tsx, a Server Component, so it isn't
// re-queried on every single request here (assets, prefetches, etc.) for latency's sake. RLS is
// the real security boundary either way -- this and the layout check are both UX-level gates.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";

  if (pathname.startsWith("/admin") && !isLoginPage && !user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (isLoginPage && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
