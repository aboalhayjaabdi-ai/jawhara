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

// Refreshes the session cookie on every request and gates /admin/* on being a real admin --
// signed in AND present in admin_users, not just signed in. This is defense in depth, one of
// three independent layers (this middleware, the page-load check in
// app/admin/(authenticated)/layout.tsx, and requireAdmin() re-checked inside every mutating
// Server Action/route -- see lib/admin/auth.ts): a solo-business admin panel's traffic is low
// enough that the extra admin_users lookup here costs nothing that matters, and RLS alone is
// never treated as the only security boundary.
//
// Also serves DB-driven storefront redirects (url_redirects, managed at /admin/settings/redirects)
// for every non-admin page route -- a plain, unauthenticated RLS-public-read lookup, skipped
// entirely for static assets (anything with a file extension) so it never adds overhead to image/
// font/script requests.
async function handleAdminAuth(request: NextRequest): Promise<NextResponse> {
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
  // Password-recovery/invite links carry their session as a URL hash fragment, which the server
  // never sees (only client-side JS does) -- so this page must stay reachable with no cookie yet,
  // the same way the login page does, or the recovery flow would redirect-loop before the browser
  // ever gets a chance to exchange the token.
  const isResetPasswordPage = pathname === "/admin/reset-password";

  // Resolved once and reused by both branches below -- a disabled account's session must never
  // bounce between "signed in, redirect away from login" and "not a real active admin, redirect
  // to login" (that pair of checks disagreeing on disabled status would be a redirect loop).
  const adminRow = user ? (await supabase.from("admin_users").select("id, disabled").eq("auth_user_id", user.id).maybeSingle()).data : null;
  const isActiveAdmin = !!adminRow && !adminRow.disabled;

  if (pathname.startsWith("/admin") && !isLoginPage && !isResetPasswordPage) {
    if (!isActiveAdmin) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }
  if (isLoginPage && isActiveAdmin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    return handleAdminAuth(request);
  }

  // Static assets (images, fonts, etc.) always have a file extension in their last segment --
  // real redirects only ever target page routes, so skip the DB lookup for these entirely.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const anon = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const { data: redirect } = await anon.from("url_redirects").select("destination_path").eq("source_path", pathname).maybeSingle();
  if (redirect) {
    return NextResponse.redirect(new URL(redirect.destination_path, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
