import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { isAdminPathAllowedForFulfillmentStaff } from "@/lib/admin/permissions";

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
  const adminRow = user ? (await supabase.from("admin_users").select("id, role, disabled").eq("auth_user_id", user.id).maybeSingle()).data : null;
  const isActiveAdmin = !!adminRow && !adminRow.disabled;

  if (pathname.startsWith("/admin") && !isLoginPage && !isResetPasswordPage) {
    if (!isActiveAdmin) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    // The restricted "fulfillment_staff" role (orders + products view only, no customer/financial/
    // settings access) is confined to an explicit page allowlist -- enforced here so a direct URL
    // to any other section redirects away, regardless of what the sidebar links to. This is a
    // section-level gate only; the finer-grained "view but don't edit" restriction *within*
    // Orders/Products is enforced separately, at the point of mutation, via requireFullAdmin().
    if (adminRow!.role === "fulfillment_staff" && !isAdminPathAllowedForFulfillmentStaff(pathname)) {
      return NextResponse.redirect(new URL("/admin/orders", request.url));
    }
  }
  if (isLoginPage && isActiveAdmin) {
    return NextResponse.redirect(new URL(adminRow!.role === "fulfillment_staff" ? "/admin/orders" : "/admin", request.url));
  }

  return response;
}

/**
 * /api/admin/* route handlers are not covered by handleAdminAuth's page-level checks (this
 * project's middleware matcher historically excluded /api/* entirely -- see the matcher below).
 * None of them are needed for fulfillment_staff's allowed workflow (viewing orders/products and
 * updating fulfillment status/tracking are both Server Actions on the page itself, not separate
 * API routes), so this denies the whole surface by default for that role rather than maintaining
 * a per-route allowlist. requireAdmin() inside each route is still the deeper, independent check.
 */
async function handleAdminApiAuth(request: NextRequest): Promise<NextResponse> {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Route handlers manage their own response/cookies; this check never needs to write any.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad." }, { status: 401 });

  const { data: adminRow } = await supabase.from("admin_users").select("role, disabled").eq("auth_user_id", user.id).maybeSingle();
  if (!adminRow || adminRow.disabled) return NextResponse.json({ error: "Inte behörig." }, { status: 403 });
  if (adminRow.role === "fulfillment_staff") {
    return NextResponse.json({ error: "Den här åtgärden är inte tillåten för den här rollen." }, { status: 403 });
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    return handleAdminAuth(request);
  }
  if (pathname.startsWith("/api/admin")) {
    return handleAdminApiAuth(request);
  }
  // Every other API route (checkout, webhooks, tracking, marketing) is untouched by this
  // middleware -- only /admin/* pages and /api/admin/* routes need the auth/role checks above.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Static assets (images, fonts, etc.) always have a file extension in their last segment --
  // real redirects only ever target page routes, so skip the DB lookup for these entirely.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const destination = (await getRedirectsMap()).get(pathname);
  if (destination) {
    return NextResponse.redirect(new URL(destination, request.url), 308);
  }

  return NextResponse.next();
}

// url_redirects is small (storefront URL redirects only) and changes rarely, through the admin
// UI -- yet this middleware runs on EVERY non-admin page request, including every background
// prefetch a <Link> in viewport issues, so a live Supabase round-trip per request here was real,
// measured overhead on the single biggest-impact path in the whole app (every product/collection
// click). Cached in module scope (persists across invocations on a warm Vercel instance) with a
// short TTL instead -- the same staleness tradeoff already accepted elsewhere in this project via
// revalidate = 60. A redirect added in the admin UI takes up to REDIRECTS_TTL_MS to take effect.
const REDIRECTS_TTL_MS = 60_000;
let redirectsCache: { map: Map<string, string>; expiresAt: number } | null = null;
let redirectsFetchInFlight: Promise<Map<string, string>> | null = null;

async function getRedirectsMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (redirectsCache && redirectsCache.expiresAt > now) return redirectsCache.map;
  if (redirectsFetchInFlight) return redirectsFetchInFlight;

  redirectsFetchInFlight = (async () => {
    const anon = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => [], setAll: () => {} },
    });
    const { data } = await anon.from("url_redirects").select("source_path, destination_path");
    const map = new Map((data ?? []).map((r) => [r.source_path as string, r.destination_path as string]));
    redirectsCache = { map, expiresAt: Date.now() + REDIRECTS_TTL_MS };
    redirectsFetchInFlight = null;
    return map;
  })();

  return redirectsFetchInFlight;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
