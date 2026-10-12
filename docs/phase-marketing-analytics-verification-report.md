# Marketing & analytics integrations — verification report

Date: 2026-10-12
Branch: `claude/festive-pasteur-77mezq`

## Scope

Priority #4 from the full-platform instruction: "Complete marketing and analytics integrations,
including Meta Pixel, Conversions API, GA4, and product feeds." Per the explicit instruction,
everything is implemented end-to-end with real code paths, but **no real Meta Pixel ID, Meta CAPI
access token, or GA4 Measurement ID has been provided** — every integration is structurally wired
but stays inert until an admin configures a real ID, and additionally gated on visitor consent.

## What was built

### 1. GDPR/ePrivacy consent gate (new, no prior implementation existed)

- `lib/marketing/consent.ts` — plain `localStorage`-backed consent state (`"accepted" | "rejected" | null`), key `jawhara_cookie_consent`.
- `components/marketing/cookie-consent-and-tracking.tsx` — one client component that both renders the
  accept/reject banner (Swedish copy, link to the refund-policy page's cookie section) and
  conditionally mounts the Meta Pixel base script and GA4 `gtag.js`, **only when both**:
  (a) the visitor has explicitly clicked "Acceptera", **and** (b) a real ID is configured for that
  integration. Rejecting, or leaving the banner undecided, never loads either script.
- Mounted once, site-wide, from `app/(storefront)/layout.tsx`, fed by
  `getPublicMarketingIds()` (`lib/admin/marketing-settings.ts`), which deliberately selects **only**
  `meta_pixel_id`/`ga4_measurement_id` — never the CAPI secret column.

### 2. Event tracking (5 real touchpoints, all safe no-ops until configured + consented)

`lib/marketing/events.ts` exports thin wrappers around `window.fbq`/`window.gtag` (optional-chained,
so they're no-ops whenever the scripts haven't loaded):

| Event | Touchpoint | File |
|---|---|---|
| PageView | fires automatically inside the Pixel's own base script | `cookie-consent-and-tracking.tsx` |
| ViewContent / view_item | PDP mount, keyed on the selected variant | `components/product/product-detail.tsx` |
| AddToCart / add_to_cart | `CartProvider.addItem()`, covers every add-to-cart surface (PDP button, homepage quick-add, variant popover, related products) in one place | `components/cart/cart-provider.tsx` |
| InitiateCheckout / begin_checkout | `/kassa` mount, once per session, using real cart subtotal/item count | `app/(storefront)/kassa/page.tsx` |
| Purchase / purchase | `/kassa/bekraftelse`, fires once when `status === "paid"`, using the real order number/total from `/api/checkout/session` | `app/(storefront)/kassa/bekraftelse/page.tsx` |

No event is ever fired with invented data — every call site passes values already present on the
page (real product/cart/order data).

### 3. Server-side Meta Conversions API (new)

`app/api/marketing/capi-purchase/route.ts` — deliberately **not** part of
`app/api/webhooks/stripe/route.ts` or `app/api/checkout/route.ts` (both remain byte-for-byte
untouched, confirmed by diff below). Called from the confirmation page once payment is confirmed.
Re-derives the order's total/currency/email/phone server-side from `orders` by the Stripe session
id — the client-supplied `sessionId` is only ever used as a lookup key, never trusted for amounts.
Uses the same Stripe Checkout session id as the client pixel's `eventID` so Meta dedupes the browser
and server events into one real conversion. Hashes email/phone (SHA-256) before sending, per Meta's
CAPI requirements. If `meta_pixel_id`/`meta_capi_access_token` aren't both configured, returns
`{ok:true, skipped:true}` — a safe no-op, never an error, never fabricated success.

### 4. Admin settings UI (new)

`/admin/settings/marketing` — Pixel ID + GA4 ID inputs with live Active/Inactive status badges, and
a separate masked (`type="password"`) CAPI token field that **never redisplays a saved value**
(only shows whether one is configured). Audit log entries record only booleans
(`pixelConfigured`, `ga4Configured`, `configured`) — never the actual ID/token values. New
`marketing_settings` table (migration `0031`) is **admin-only RLS**, deliberately separate from the
public-read `store_settings` table, since it holds a real secret.

### 5. Product feed (new)

`/feed/products.xml` — Google Shopping / Meta Catalog-compatible RSS 2.0 feed (`<g:*>` namespace),
generated live from real, active Supabase product data (`lib/queries.ts`'s new
`getProductFeedItems()`). No external credentials needed; linked from the admin marketing settings
page. Needs no consent gate (it's a server-to-server feed, not a browser tracking script).

## Verification performed

### Static checks

- `npx tsc --noEmit` — clean (found and fixed one pre-existing null-safety bug in
  `lib/admin/marketing-settings.ts`'s `getMarketingSettings()`).
- `npm run build` — clean; `/feed/products.xml` and `/api/marketing/capi-purchase` both compile and
  register as routes.

### Live browser verification (Playwright, disposable admin accounts created via the Supabase Auth
Admin API and deleted immediately after each run; local dev server only)

1. **Consent gate**: banner visible on first visit; `window.fbq`/`window.gtag` are `undefined`
   before consent; clicking "Acceptera" persists `localStorage` consent and the banner doesn't
   reappear on reload; clicking "Avvisa" persists the rejected state; `fbq`/`gtag` remain
   `undefined` even after accepting, because no real Pixel/GA4 ID is configured yet — confirms the
   dual gate (consent **and** configuration) is enforced, not just one or the other.
2. **Full storefront flow with no console/page errors**: homepage → consent accept → PDP visit
   (fires `trackViewContent`) → add to cart (fires `trackAddToCart`) → `/kassa` (fires
   `trackInitiateCheckout`) — zero `pageerror`/`console.error` events across the whole flow,
   confirming every tracking call site is a safe no-op end-to-end with real page data and no real
   IDs configured.
3. **Admin settings — Pixel/GA4 IDs**: logged in as a disposable admin, set a real-looking Pixel ID
   and GA4 ID, saved, confirmed the `marketing_settings` row updated correctly; reloaded and
   confirmed the (non-secret) Pixel ID correctly round-trips into the input's value; cleared both
   fields and confirmed the row went back to `null`/`null`.
4. **Admin settings — CAPI token**: saved a token, confirmed the DB row updated; reloaded and
   confirmed the password input is always empty (never redisplays the secret) while the status
   badge correctly shows "Aktiv"; used "Ta bort token" (confirm-dialog accepted) and confirmed the
   token column returned to `null`.
5. **Product feed**: `GET /feed/products.xml` returns `200`, `Content-Type: application/xml`, and
   real item data — spot-checked two products' real prices/sale-price/image URLs/availability
   against the live Supabase data (e.g. a real on-sale product correctly emits both `<g:price>` and
   `<g:sale_price>`).

### Protected-files diff check

```
git diff --stat -- app/api/checkout/route.ts app/api/webhooks/stripe/route.ts lib/discounts.ts
```
Empty output — all three files are confirmed byte-for-byte unchanged by this phase.

### Cleanup verification

- `marketing_settings` table confirmed back to fully `null` (clean slate) after testing.
- No disposable test admin accounts (`%@example.com`) left in `admin_users`/`auth.users`.

## External integrations awaiting configuration

None of the following are invented or faked anywhere — they are structurally wired and tested with
synthetic values, but genuinely inactive until you provide:

1. **Meta Pixel ID** (Meta Events Manager → your Pixel's settings) — enter at `/admin/settings/marketing`.
2. **Meta Conversions API access token** (Meta Events Manager → your Pixel → Settings → Conversions
   API → Generate access token) — enter at `/admin/settings/marketing` (masked, never redisplayed).
3. **GA4 Measurement ID** (Google Analytics → Admin → Data Streams → your web stream) — enter at
   `/admin/settings/marketing`.

Once all three are entered and a real visitor accepts the cookie banner, Meta Events Manager and
Google Analytics will start showing real events — no test/fake data will ever appear there from
this build.

## Files changed/added

- New: `supabase/migrations/0031_phase_marketing_settings.sql`
- New: `lib/admin/marketing-settings.ts`, `lib/marketing/consent.ts`, `lib/marketing/events.ts`
- New: `components/marketing/cookie-consent-and-tracking.tsx`, `components/admin/marketing-settings-form.tsx`
- New: `app/admin/(authenticated)/settings/marketing/{page.tsx,actions.ts}`
- New: `app/api/marketing/capi-purchase/route.ts`
- New: `app/feed/products.xml/route.ts`
- Modified: `app/(storefront)/layout.tsx` (mounts the consent/tracking component)
- Modified: `components/product/product-detail.tsx` (ViewContent)
- Modified: `components/cart/cart-provider.tsx` (AddToCart)
- Modified: `app/(storefront)/kassa/page.tsx` (InitiateCheckout)
- Modified: `app/(storefront)/kassa/bekraftelse/page.tsx` (Purchase + CAPI call)
- Modified: `lib/queries.ts` (added `getProductFeedItems()`)
- Modified: `app/admin/(authenticated)/settings/page.tsx`, `components/admin/audit-log-filter-bar.tsx` (nav/audit entity wiring)

## Not touched (confirmed)

`app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/discounts.ts`, the admin
dashboard's other sections, every already-shipped storefront feature.
