# Jawhara — Technical Handover Document

**Purpose:** This document is written so a *new* Claude session, with zero access to the conversation history that built this project, can understand the existing Jawhara codebase well enough to reuse its proven backend/admin architecture while building a **new, independent luxury-handbag storefront** (new frontend, new Shopify data source, new Stripe account, new Meta Pixel).

**Scope of this document:** 100% read-only research. No code was modified, nothing was deployed, no secrets are included anywhere below (only environment variable *names*, never values), and no Meta product catalog was created or configured.

**How this document was produced:** Seven independent, parallel, read-only research passes over the actual codebase (not from memory) — architecture/deployment, Shopify-vs-Stripe checkout verification, Meta Pixel/CAPI, admin dashboard, database schema/product catalog, the Stripe commerce engine, and git history/docs mining. Every claim below is grounded in a real file path, and most cite exact line numbers or function names. Where something could not be verified by reading code (e.g., "has a real Pixel ID actually been entered"), that is stated explicitly rather than assumed.

**Repository root referenced throughout:** `/home/user/jawhara` (adjust to wherever you clone it). Git branch at time of writing: `claude/festive-pasteur-77mezq`, 94 commits.

---

## 0. Read This First — Correcting a Premise

The handover brief this document was requested against asks for detail on "Shopify checkout... Storefront API, cart creation, variant handling, checkout redirects, order synchronization." **This does not exist in the current system, and it's important the new Claude not go looking for it.**

Verified by direct, exhaustive grep across `app/`, `lib/`, `components/` for every Shopify Storefront-API fingerprint (`"Storefront API"`, `storefrontApiClient`, `checkoutCreate`, `cartCreate`, `X-Shopify-Storefront-Access-Token`, `myshopify.com/api/20`): **zero matches.** There is no Storefront Access Token anywhere, no `@shopify/storefront-api-client` dependency, and no live Shopify checkout flow, now or historically in this codebase.

**What is actually true:**
- **Checkout is 100% Stripe** — a Stripe embedded Checkout Session (`ui_mode: "embedded"`), built in `app/api/checkout/route.ts` + `app/api/webhooks/stripe/route.ts`. See §2.
- **Shopify is used only for read-only Admin API access** (not Storefront API) — a one-time historical data extraction when this project first migrated off Shopify, plus an ongoing, admin-triggered, read-only order-reconciliation/sync mechanism. See §6.
- **No customer-facing page makes a live call to Shopify at request time.** If the original Shopify store went offline entirely, the storefront, cart, and checkout would be completely unaffected. Only an admin's manual "Sync from Shopify" button and some CLI scripts would fail.

If the new project genuinely wants Shopify-native checkout (Shopify's own Storefront API cart/checkout flow) for the new store, **that is new engineering work, not something to port from here** — this codebase's proven, reusable checkout engine is Stripe-based. If "new Shopify store" instead means "use a new Shopify store purely as a data source to populate the new site's catalog, same as this project's original migration, while still checking out via Stripe like today," then everything in §6 and §9 below is directly reusable. **Confirm which of these two is actually wanted before building — don't assume.**

---

## 1. Complete Architecture

### 1.1 Tech stack (verified installed versions, not just declared ranges)

| Area | Package | Installed version |
|---|---|---|
| Framework | `next` | **15.5.27** |
| UI | `react` / `react-dom` | **19.3.0** |
| Language | `typescript` (dev) | **5.9.3** |
| Payments | `stripe` (server SDK) | **17.7.0** |
| Payments | `@stripe/stripe-js` | **5.10.0** |
| Payments | `@stripe/react-stripe-js` | **3.11.0** |
| Database | `@supabase/supabase-js` | **2.117.3** |
| Database | `@supabase/ssr` | **0.12.7** |
| Email | `resend` | **4.8.0** |
| Admin DnD | `@dnd-kit/core` / `sortable` / `utilities` | 6.3.1 / ^10.0.0 / ^3.2.2 |
| Admin tables | `@tanstack/react-table` | 9.2.8 (**installed but not actually used anywhere** — all admin tables are hand-written HTML) |
| Rich text | `@tiptap/react`, `starter-kit`, `pm` | 3.31.4 |
| Admin charts | `recharts` | 3.10.1 (used in exactly one place: `components/admin/sales-trend-chart.tsx`) |
| Image processing | `sharp` | 0.35.5 |
| Node fetch/proxy | `undici` | 7.30.0 |
| Excel export | `exceljs` | ^4.4.0 |
| Scripts | `tsx` (dev) | ^4.19.2 |
| Styling | `tailwindcss` / `postcss` / `autoprefixer` | ^3.4.17 / ^8.4.49 / ^10.4.20 (dev) |

Project is ESM (`"type": "module"`), `"private": true`.

**npm scripts** (`package.json`): `dev` (`next dev`), `build`, `start`, `lint`, `audit` (`tsx scripts/shopify/audit.ts`). Every other one-off script under `scripts/` is run ad hoc via `tsx scripts/....ts`, not wired into `package.json`.

### 1.2 `next.config.mjs` (full, 33 lines)

```js
const nextConfig = {
  experimental: { nodeMiddleware: true },
  async redirects() { return [{ source: "/apps/parcelpanel", destination: "/pages/contact", permanent: false }]; },
  images: { loader: "custom", loaderFile: "./lib/image-loader.ts" },
};
```

- `experimental.nodeMiddleware: true` forces `middleware.ts` onto the **Node.js runtime** instead of Edge, because middleware needs `undici`'s `ProxyAgent` to route outbound fetches through a required proxy (Edge can't do this — see §1.7).
- `redirects()` — one static redirect, a leftover from the original Shopify URL scheme.
- `images.loader: "custom"` hands all `next/image` resolution to `lib/image-loader.ts` — this is the mechanism that keeps the app off Vercel's own Image Optimization endpoint entirely (see §1.3 and §6.5 in the fixes log).

### 1.3 Image pipeline

**`lib/image-loader.ts`** (full file, 42 lines) — `WIDTH_TIERS = [480, 960, 1600]`:
```ts
export default function jawharaImageLoader({ src, width }) {
  if (src.includes("/storage/v1/object/public/product-media/") && !/\.w\d+\.webp$/.test(src))
    return `${src}.w${nearestTier(width)}.webp`;
  if (src.startsWith("/brand/") && src.endsWith(".webp") && !/\.w\d+\.webp$/.test(src))
    return `${src}.w${nearestTier(width)}.webp`;
  if (src.includes("cdn.shopify.com")) {
    const tier = nearestTier(width);
    return src.includes("?") ? `${src}&width=${tier}` : `${src}?width=${tier}`;
  }
  return src;
}
```
- Supabase Storage product images → rewritten to a pre-generated `.w{tier}.webp` sibling file.
- Local `/brand/*.webp` (homepage hero/comparison images) → same tiered-sibling rewrite, generated once at build time.
- Shopify CDN URLs (any not-yet-rehosted banners) → Shopify's own free native resize-by-URL param.
- Everything else → passed through unchanged.
- **Why this matters**: once a custom loader is configured, `next/image` **never** calls Vercel's `/_next/image` optimization endpoint, for any image, regardless of traffic. This is the fix for a real production incident — see §6.5.

**Upload pipeline**:
- `lib/image-processing.ts` — `IMAGE_WIDTH_TIERS = [480, 960, 1600]`, `generateWebpVariants()` (via `sharp`, quality 82, never upscales), `variantStoragePath()`.
- `lib/supabase/upload-with-variants.ts` — `uploadImageWithVariants()`: uploads the original unresized (far-future `cache-control: 31536000`), generates + uploads the 3 WebP variants in parallel; on variant-generation failure, falls back to uploading the original bytes under the variant paths so the loader can never construct a 404ing path.
- Supporting one-off scripts: `scripts/supabase/backfill-image-variants.ts`, `scripts/supabase/rehost-collection-images.ts`, `scripts/supabase/backfill-variant-media.ts`.

### 1.4 `middleware.ts` (full file, 180 lines, Node.js runtime)

1. **Proxy setup** (lines 13–16) — installs a global `undici.ProxyAgent` if `HTTPS_PROXY`/`https_proxy` is set, before any Supabase call (needed for `supabase.auth.getUser()`'s own network call).
2. **`handleAdminAuth()`** for `/admin/*` — Supabase SSR client, `getUser()` (revalidates against Supabase, never trusts a local JWT decode), looks up `admin_users` once, allows `/admin/login` and `/admin/reset-password` through unauthenticated, redirects non-admins to login, and for `fulfillment_staff` restricts to an allowlist (`lib/admin/permissions.ts`) redirecting anything else to `/admin/orders`.
3. **`handleAdminApiAuth()`** for `/api/admin/*` — same check, returns JSON 401/403 instead of redirecting; denies the entire `/api/admin/*` surface to `fulfillment_staff`.
4. **Redirect lookup** for every other non-admin, non-API, non-static-asset request — queries the public `url_redirects` table, cached in module scope for 60s with in-flight-promise dedup to avoid a Supabase round trip on every prefetch.
5. **Matcher**: `/((?!_next/static|_next/image|favicon.ico).*)`.

This is documented in-code as **one of three independent defense-in-depth layers** for admin auth (middleware → `app/admin/(authenticated)/layout.tsx` page-load check → `requireAdmin()`/`requireFullAdmin()` re-checked inside every mutating Server Action). See §4.2.

### 1.5 Route structure (`app/`)

```
app/
├── (storefront)/              route group, no URL segment
│   ├── layout.tsx, page.tsx ("/"), not-found.tsx
│   ├── collections/[handle]/, products/[handle]/, pages/[handle]/
│   ├── search/, preview/ (storefront-editor live preview)
│   ├── kassa/ ("checkout"), kassa/bekraftelse/ ("confirmation")
│   └── sparra-mitt-paket/ ("track my package")
├── admin/                     real segment
│   ├── login/, reset-password/, signout/route.ts   (outside the auth gate, deliberately)
│   ├── print/ (own layout.tsx, print/orders/[id]/packing-slip/)
│   └── (authenticated)/       route group — gated by middleware + layout.tsx
│       └── orders/, products/, collections/, customers/, discounts/, content/,
│           email-templates/, product-templates/, reviews/, security/, settings/,
│           staff/, storefront/, audit-log/, page.tsx (dashboard)
├── api/
│   ├── admin/...              gated by middleware's handleAdminApiAuth
│   ├── cart/totals/, checkout/, checkout/session/
│   ├── marketing/capi-purchase/, tracking/lookup/, webhooks/stripe/
├── feed/products.xml/route.ts, robots.ts, sitemap.ts, icon.tsx
```

### 1.6 Environment variables (names only — never values)

**Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` (Management API, used only by local scripts for DDL), `SUPABASE_DB_PASSWORD` (declared in `.env.local.example`, not actually read anywhere in current code — reserved/unused).

**Stripe**: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_CHECKOUT_ENABLED` (the live/off kill switch).

**Email**: `RESEND_API_KEY`.

**Shopify (extraction/migration-only, never read by the deployed storefront)**: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`. Read independently by two separate client modules: `lib/shopify/client.ts` (app-side, used only by the admin "Sync from Shopify" route chain) and `scripts/shopify/client.ts` (standalone CLI scripts).

**Tracking**: `SEVENTEENTRACK_API_KEY` (17TRACK order-tracking — see §10).

**Marketing/Meta**: **none**. There is no environment variable for Pixel ID, CAPI token, or GA4 ID — these are admin-configured database values (`marketing_settings` table), not `.env` values. See §3.

**Misc**: `NEXT_PUBLIC_SITE_URL` (used in `robots.ts`, `sitemap.ts`, the product feed, emails, admin invite links — not present in `.env.local.example`, must be set independently per deployment), `HTTPS_PROXY`/`https_proxy` (dev-sandbox-only proxy requirement — see §1.7, not needed on real hosting like Vercel).

### 1.7 The proxy quirk (dev-sandbox-only, not a production requirement)

This project's *development* container only allows outbound HTTPS through a local proxy, and Node's native `fetch` doesn't honor `HTTPS_PROXY` automatically. Every server-side module making outbound calls (Supabase auth/REST/storage clients, Stripe's SDK forced onto its fetch-based `NodeHttpClient` instead of the default `node:https`-based one, the Shopify Admin client, the 17TRACK client, `middleware.ts`) explicitly installs a proxy dispatcher:
```ts
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));
```
`lib/stripe/server.ts`'s comment states this explicitly: harmless in real production hosting like Vercel, "where there is no such proxy and fetch just goes straight out." **A new deployment on normal hosting does not need to replicate this** — it's purely an accommodation for this specific sandboxed dev environment. It's also the direct reason `nodeMiddleware: true` is set (§1.2) — if you don't need the proxy, you likely don't need that either, but removing it isn't necessary either.

### 1.8 Deployment reality (as documented, see §8 for full detail)

Production domain: **`jawhara.se`**, on Vercel, Hobby (free) plan, project `am-207d/jawhara`. `NEXT_PUBLIC_CHECKOUT_ENABLED` is kept `false` in production by deliberate, standing decision — checkout has never been enabled for real customer traffic as of the last verification report reviewed.

---

## 2. Checkout — The Real Implementation (Stripe, Not Shopify)

See §0 for the correction this section assumes. Everything below is read from `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/discounts.ts`, `components/cart/cart-provider.tsx`.

### 2.1 Cart model (`components/cart/cart-provider.tsx`)

```ts
type CartItem = {
  variantId: string; productHandle: string; title: string; variantTitle: string;
  price: number; compareAtPrice: number | null; image: string | null; qty: number;
};
```
This is a **client-side display snapshot only** — price is never trusted for actual charging.

- **Persistence**: `localStorage["jawhara_cart"]`; discount code separately under `localStorage["jawhara_discount_code"]`.
- **Context split**: `CartActionsContext` (stable, `useCallback`'d actions) vs. `CartStateContext` (items/isOpen/subtotal/count/hydrated/bump/discountCode) — so a component that only calls `addItem` (e.g. every "Add to cart" button on a grid of dozens of product cards) never re-renders on unrelated state changes like the drawer opening. `useCart()` combines both; `useCartActions()` is actions-only.
- **`addItem(item, qty)`** merges by `variantId`, bumps a transient `bump` counter (drives UI feedback like a cart-icon pop animation), fires the `AddToCart` marketing event.
- **`useCartTotals()`** hook: debounces 300ms on cart/discount-code changes, POSTs to `/api/cart/totals`, tracks a `requestId` to discard stale responses. **Never computes price/discount client-side** — always defers to the server.

### 2.2 Server-authoritative totals — `lib/discounts.ts`'s `computeCheckoutTotals()`

This is **the single source of truth for all pricing**, called both by the read-only `/api/cart/totals` route (live display totals, un-gated by the checkout flag — "showing someone an accurate price isn't a checkout action") and by `/api/checkout` itself.

**Signature**: `computeCheckoutTotals(cart: {variantId, qty}[], discountCode?: string, customerEmail?: string)`.

**What it does, step by step**:
1. Re-fetches real `price`, `inventory_quantity`, `inventory_tracked`, `inventory_policy`, product `status`, and real Shopify collection membership for every submitted `variantId` — the client's own price/qty claims never survive past this point.
2. Validates each line via `isVariantAvailable()` (`lib/inventory.ts` — see §5.2 for the exact rule); failures push Swedish error strings into `errors`, and `/api/checkout` blocks on any error.
3. Expands quantities into individual "units" for per-unit BXGY (buy-X-get-Y) matching.
4. Loads `status='active'` discounts, pre-filters by `usage_limit`/`applies_once_per_customer` via `discount_redemptions` counts, resolves a submitted `discountCode` case-insensitively against `kind='code'` rows.
5. **Exclusivity rule**: a discount with `combines_with_order=false` or `combines_with_product=false` becomes the sole applied discount; everything else that would otherwise apply gets pushed into `discountNotices` (customer-facing explanation strings) instead of being applied — mirroring Shopify's own both-sides-must-agree combination semantics.
6. **BXGY matching** handles two real shapes distinctly:
   - **Same buy/get set** (e.g. "3 för 2"): cheapest-first pool, `groupSize = buy_quantity + get_quantity`, `applications = floor(pool.length / groupSize)` capped by `uses_per_order_limit`, free units = cheapest `applications * get_quantity`.
   - **Disjoint buy/get sets** (e.g. "Valfri Plånbok" — buy a bag, get a free wallet from a *different* product set): buy-units and get-units counted independently, same capping logic.
7. `eligibleDiscountsByVariant` is built separately and is **display-only** — maps variantId → discount titles for every active BXGY promo the variant is *eligible* for, independent of whether the current cart actually earns a free unit. Never affects pricing.
8. **VAT**: `getVatRatePercent()` reads `store_settings['vat_rate_percent']`, default `0` — this **is** a real configurable setting, not a hardcoded literal.
9. **Shipping**: the return type literally types `shipping: 0` — a hardcoded always-free constant (see §2.6 for the caveat about unused shipping-zone infrastructure).
10. Returns `{ lines, subtotal, appliedDiscounts, discountTotal, vat, shipping: 0, total, errors, discountNotices, codeDiscountId, eligibleDiscountsByVariant }`.

### 2.3 Checkout route — `app/api/checkout/route.ts`

1. **Hard gate**: 403 unless `process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true"` server-side — independent of any UI hiding the button.
2. Validates cart non-empty; recomputes totals via `computeCheckoutTotals`; 400s on any error or non-positive total.
3. **Inserts the pending `orders` row first**: `order_number: "JH-" + Date.now()`, `financial_status: "pending"`, `source: "stripe"`, a full price snapshot, and `applied_discounts` (display-only, never read by pricing logic again).
4. Inserts `order_items`, titles backfilled from a real `products` lookup.
5. Resolves real purchased-variant images (`lib/order-images.ts`) for Stripe's line-item display.
6. Builds Stripe `line_items` from `totals.lines` (`unit_amount` in öre); if `totals.vat > 0`, adds a separate positive "Moms" line item (Stripe forbids negative line amounts).
7. **Discounts on Stripe's side**: creates an ad-hoc one-time Stripe `coupon` (`amount_off`, `duration: "once"`) for the already-server-computed `discountTotal`, rather than re-deriving discount logic inside Stripe.
8. **Creates the Checkout Session**: `ui_mode: "embedded"`, `mode: "payment"`, `shipping_address_collection: { allowed_countries: ["SE"] }` (Sweden-only, matches 100% of real historical order history), `phone_number_collection: { enabled: true }`, `metadata.order_id` + `metadata.applied_discount_ids` for webhook correlation, `return_url: {origin}/kassa/bekraftelse?session_id={CHECKOUT_SESSION_ID}`.
9. Updates the order with `stripe_checkout_session_id`; inserts a `payments` row (`status: "pending"`, `gateway: "stripe"`).
10. Returns `{ clientSecret: session.client_secret }` for the embedded Stripe Elements UI.

Stripe API version pinned: `"2025-02-24.acacia"` (`lib/stripe/server.ts`).

### 2.4 Webhook handler — `app/api/webhooks/stripe/route.ts`

1. Verifies signature via `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
2. **Idempotency**: insert-first into `webhook_events` keyed by `stripe_event_id`; a unique-constraint conflict = already processed, short-circuit `{ deduped: true }`. If handling throws *after* that insert, the row is deleted so a genuine Stripe retry can reprocess.
3. **`checkout.session.completed`** (`handleCheckoutCompleted`):
   - Per order line: skip if `inventory_tracked=false`; unconditional `force_decrement_inventory` RPC if `inventory_policy="CONTINUE"`; atomic, stock-checked `decrement_inventory` RPC otherwise.
   - **Oversell safety**: on a failed `decrement_inventory`, rolls back everything already decremented in the same pass, sets `financial_status="voided"` + `tags: ["oversold-auto-refunded"]`, and issues a real `stripe.refunds.create()` — no address/email processing happens for an oversold order.
   - On success: inserts `addresses` from `session.shipping_details` (fallback to `collected_information.shipping_details` for newer Stripe API versions), marks the order `paid`, updates the `payments` row to `succeeded`, records `discount_redemptions` **only now** (so an abandoned session never consumes a limited-use code), sends the order confirmation email.
4. **`payment_intent.payment_failed`** → marks `payments.status="failed"`.
5. **`charge.refunded`** → marks `payments.status="refunded"`, inserts a `refunds` row, sends a refund-notification email.

### 2.5 Admin-initiated refund safety guard — `lib/orders/refund-guard.ts`

`getStripeRefundablePayment(orderId)` is the single enforcement point ensuring **a historical Shopify-origin order (or any order with no real Stripe payment) can never trigger a real Stripe refund**. It checks for a `payments` row with `status='succeeded'` AND `stripe_payment_intent_id IS NOT NULL` — explicitly "is there real Stripe money on this order," not "what does the order's origin field claim." Consumed exclusively by `app/admin/(authenticated)/orders/[id]/actions/refunds.ts`'s `createRefund()`, which branches: real payment found → real `stripe.refunds.create()` (+ `refunds` row `kind: "full"|"partial"`); none found → `refunds` row `kind: "manual_historical"`, **zero Stripe API calls**. Verified end-to-end in prior testing including a live-API rejection proving the guard actually blocks the Stripe branch rather than just hiding a button.

### 2.6 Shipping — currently hardcoded, richer model built but NOT wired in

`lib/shipping-method.ts`: `SHIPPING_METHOD_NAME = "PostNord Hemleverans"`. A configurable `shipping_zones`/`shipping_rates`/`shipping_carriers` admin UI exists (`/admin/settings/shipping`, `/admin/settings/carriers`) but its own page displays an explicit warning: **not yet connected to the real checkout** — changing values there does not affect what a customer is actually charged. The live checkout path still uses the hardcoded `shipping: 0` from `computeCheckoutTotals`. Treat `app/api/checkout/route.ts`, the webhook, and `lib/discounts.ts` as the project's most sensitive files — repeatedly diffed byte-for-byte before every other commit throughout this project's history, and wiring in zone-based pricing was deliberately deferred pending separate explicit approval.

### 2.7 Inventory consumption helpers

- **`lib/inventory/consume.ts`**'s `consumeInventoryForOrderItems()` — same decrement logic as the webhook, extracted for reuse by **manual admin "mark as paid" orders** (no Stripe webhook exists for those).
- **`lib/inventory/restock.ts`**'s `restockOrderItems()` — adds inventory back (negative `force_decrement_inventory`), used by order cancellation and returns.

### 2.8 Transactional email — Resend

Provider: Resend (`lib/email/send.ts`, `RESEND_API_KEY`). Four templates, each pulled live from an **admin-editable DB table** (`email_templates`, draft/publish split) via `getLiveEmailTemplate(key)`:

| Function | File | Trigger |
|---|---|---|
| `sendOrderConfirmationEmail` | `lib/email/order-confirmation.ts` | Stripe webhook `checkout.session.completed` |
| `sendShippingConfirmationEmail` | `lib/email/shipping-confirmation.ts` | Admin fulfillment creation (single or bulk), includes a signed 17TRACK tracking link |
| `sendRefundNotificationEmail` | `lib/email/refund-notification.ts` | Admin refund action AND the `charge.refunded` webhook |
| `sendOrderCancellationEmail` | `lib/email/order-cancellation.ts` | Admin order cancellation |

**Duplicate-send protection is indirect, not a dedicated mechanism**: order confirmation is protected transitively by the webhook's `webhook_events` dedupe; the other three have no stored "already sent" flag and rely on the admin not re-clicking the trigger.

---

## 3. Meta Pixel & Conversions API — Confirmed vs. Unverified

**This is structurally complete, correctly built, but has never fired a single real event** (no real Pixel ID/CAPI token/GA4 ID has ever been configured, per the project's own verification report). Read this section carefully — it separates what's genuinely proven from what's still a gap.

### 3.1 Files

| File | Role |
|---|---|
| `lib/marketing/consent.ts` | `localStorage["jawhara_cookie_consent"]` consent state (`"accepted"\|"rejected"\|null`) |
| `lib/marketing/events.ts` | `fbq`/`gtag` wrapper functions |
| `components/marketing/cookie-consent-and-tracking.tsx` | Cookie banner + conditional Pixel/GA4 script injection |
| `app/api/marketing/capi-purchase/route.ts` | Server-side Meta CAPI "Purchase" POST |
| `lib/admin/marketing-settings.ts` | DB-backed settings reader (server-only; throws if imported client-side) |
| `app/admin/(authenticated)/settings/marketing/{page,actions}.tsx` | Admin settings UI |
| `supabase/migrations/0031_phase_marketing_settings.sql` | `marketing_settings` table |
| `app/feed/products.xml/route.ts` | Public product feed (Google/Meta-compatible XML) |

### 3.2 Configuration is DB-driven, not env-var-driven

**No Meta/Facebook environment variable exists anywhere.** Pixel ID, GA4 Measurement ID, and the Meta CAPI access token all live in the single-row `marketing_settings` table, set via `/admin/settings/marketing`. `getPublicMarketingIds()` exposes only the two non-secret IDs to client code; `getMarketingSettings()` (server-only) is the only reader of the CAPI token.

**⚠️ Confirmed inaccuracy to fix in a new build**: the admin UI claims the CAPI token is "Sparas krypterat i databasen" (saved encrypted). It is **not** — it's a plain `text` column with no encryption function anywhere in the codebase (confirmed: zero matches for `encrypt|decrypt|pgsodium|vault`). Protected only by admin-only RLS, not application-level encryption. If building a new version of this, either actually encrypt it or fix the UI copy.

### 3.3 Consent gating — CONFIRMED correctly implemented (strict block-before-consent)

```tsx
const trackingActive = consent === "accepted";
{trackingActive && metaPixelId && ( <Script>...fbq('init', ...); fbq('track','PageView');...</Script> )}
{trackingActive && ga4MeasurementId && ( <Script src="googletagmanager.com/gtag/js..."/> )}
```
Both scripts are **conditionally rendered JSX** — not loaded-then-hidden. Nothing fires before explicit "Acceptera." Rejecting, or an undecided banner, means `window.fbq` never exists; every event-wrapper call is `window.fbq?.(...)`, a safe no-op either way.

### 3.4 Client-side standard events — CONFIRMED, exact triggers

| Event | Trigger | File:line |
|---|---|---|
| `PageView` | Hardcoded once in the Pixel base script itself — **not re-fired on client-side (soft) navigation between pages** | `cookie-consent-and-tracking.tsx:48` |
| `ViewContent` | PDP mount, keyed on `[handle, variant?.id]` | `components/product/product-detail.tsx:141-145` |
| `AddToCart` | `CartProvider.addItem()` — every add-to-cart path | `components/cart/cart-provider.tsx:101-111` |
| `InitiateCheckout` | `/kassa` mount, once (ref-guarded) | `app/(storefront)/kassa/page.tsx:22-30` |
| `Purchase` | `/kassa/bekraftelse`, fires once when polling detects `status==="paid"` | `app/(storefront)/kassa/bekraftelse/page.tsx:79-90` |

`trackPageView()` is defined but never called anywhere — only the inline base-script `PageView` fires, once per Pixel init. **Gap to fix in a new build**: no `PageView` refire on Next.js soft navigation.

### 3.5 Server-side CAPI — CONFIRMED implemented, with real gaps

`app/api/marketing/capi-purchase/route.ts`:
- **Triggered client-side**, from the same confirmation-page effect that fires the Pixel `Purchase` call — a best-effort `fetch(...).catch(() => {})`. **Not called from the Stripe webhook.** This means CAPI delivery depends on the buyer's browser actually loading the confirmation page and completing the request — **not a guaranteed server-to-server signal**, despite that normally being CAPI's whole point. If rebuilding, consider firing CAPI from the webhook instead/as well for true reliability.
- Re-derives all order data server-side from `stripe_checkout_session_id` (requiring `financial_status='paid'`) — never trusts client-supplied amounts.
- Returns a safe no-op (`{ok:true, skipped:true}`) if Pixel ID/CAPI token aren't both configured.
- Hashes email (SHA-256, lowercased/trimmed) and phone (digits/`+` only) for `user_data`.
- POSTs to `https://graph.facebook.com/v21.0/{metaPixelId}/events?access_token={token}`.
- **Event dedup — CONFIRMED correctly implemented**: both the client `fbq('track','Purchase',...,{eventID: sessionId})` and the server `event_id: sessionId` use the identical Stripe Checkout session ID, satisfying Meta's dedup requirement.
- **Confirmed gap**: `user_data` contains only hashed email/phone — **no `fbp`/`fbc` cookies, no `fbclid` capture, no client IP/user-agent** are collected anywhere in the codebase (zero grep matches for any of these). This meaningfully limits Meta's Event Match Quality scoring. A new build should capture `_fbp`/`_fbc` cookies and forward `client_ip_address`/`client_user_agent` in the CAPI payload.

### 3.6 Product feed — real XML, zero live catalog connection

`/feed/products.xml` is a real, live, correctly-formatted Google `<g:*>`-namespace RSS feed sourced from the actual `products`/`product_variants`/`media` tables (status=active only). **Confirmed: nothing in the codebase pushes this to Meta Commerce Manager or Google Merchant Center** — no catalog ID, no scheduled sync, no Graph API catalog-batch call. The admin settings page literally instructs a human to copy the feed URL into Meta/Google manually. Whether that manual step has ever been done is unknown from code alone. **Per this task's explicit instruction, no catalog was created or configured during this research pass — that remains entirely for later, deliberate action.**

### 3.7 Summary table

| | Status |
|---|---|
| Consent gating | ✅ CONFIRMED correct |
| 5 standard client events wired with real data | ✅ CONFIRMED (PageView doesn't refire on soft-nav) |
| Server CAPI route exists, re-derives data, hashes PII | ✅ CONFIRMED |
| Event ID dedup between Pixel and CAPI | ✅ CONFIRMED correct |
| CAPI fired reliably server-to-server (not browser-dependent) | ❌ NOT implemented — client-fetch-triggered only |
| fbp/fbc/IP/UA attribution data | ❌ NOT implemented at all |
| CAPI token "encrypted" as the UI claims | ❌ FALSE — plaintext DB column |
| Real Pixel ID/CAPI token/GA4 ID ever configured | ❓ UNKNOWN — DB state not inspectable from a code-only pass |
| Real events ever landed in Meta Events Manager | ❓ UNKNOWN — requires live Events Manager access |
| Feed connected to an actual Meta/Google catalog | ❓ UNKNOWN / likely not — would be a manual external step |

---

## 4. Admin Dashboard

A full custom-built, Shopify-Admin-style dashboard under `app/admin/**`. Session model: Supabase Auth (cookie JWT via `@supabase/ssr`) — any `auth.users` row can sign in, but is only treated as an admin if a matching row exists in `admin_users`.

### 4.1 Roles

`lib/admin/auth.ts`: `AdminRole = "admin" | "staff" | "fulfillment_staff"`.
- **`admin`** — full access; the *only* role allowed for GDPR-sensitive customer actions and staff management.
- **`staff`** — currently behaves identically to `admin` in every check except the admin-only ones; exists so the role-keyed architecture is in place ahead of real future differentiation.
- **`fulfillment_staff`** — confined to Orders + Products(view-only) + packing-slip print; within Orders can only create fulfillments/tracking — no refunds/cancellations/returns/notes/pricing/inventory edits/deletes/imports/manual orders.

### 4.2 Three independent authorization layers (each redundant with the others by design)

1. `middleware.ts` — per-request admin-row check + `fulfillment_staff` path-prefix allowlist (`lib/admin/permissions.ts`'s `isAdminPathAllowedForFulfillmentStaff`), denies all of `/api/admin/*` to that role.
2. `app/admin/(authenticated)/layout.tsx` — page-load re-check.
3. **`requireAdmin()`** (baseline — live session + active admin row) and **`requireFullAdmin(admin)`** (returns an error if `role==="fulfillment_staff"`) called inside *every* mutating Server Action/route — this is the real, final guard; a hidden button is never the only thing stopping a write. **`requireRole(admin, role)`** is a stricter exact-role check used only for GDPR hard-delete/export and staff management.

### 4.3 Audit logging

`logAdminAction(actorId, action, entityType?, entityId?, detail?)` (`lib/admin/auth.ts`) writes to `audit_log` via the service-role client; never throws into the caller (a logging failure is swallowed). Called from essentially every mutating action across every feature area with a `"area.action"` string (e.g. `"orders.refund_stripe"`). Viewer: `/admin/audit-log`, `lib/admin/audit-log.ts`, resolves `actor_id → email` by cross-referencing `admin_users` with `supabaseService.auth.admin.listUsers()` (no email column on `admin_users` itself).

### 4.4 Feature inventory (routes + Server Actions + what each does)

**Orders** — `/admin/orders`, `/admin/orders/[id]`, `/admin/orders/new`, `/admin/print/orders/[id]/packing-slip`. Actions: `fulfillment.ts` (createFulfillment — writes `fulfillments`/`fulfillment_items`, bumps `order_items.fulfilled_quantity`, registers 17TRACK tracking, optional email), `refunds.ts` (createRefund, guarded per §2.5), `cancellation.ts` (cancelOrder — blocks if a refund exists, requires `force` if already shipped, restocks unfulfilled remainder), `returns.ts` (createReturn), `notes.ts`, `bulk-fulfillment.ts`, `hide.ts` (soft-delete via `hidden_at`, never touches financial rows), `new/actions.ts` (createManualOrder — two payment modes: `stripe_link` real session, or `mark_paid` oversell-safe consumption). CSV/Excel export: `app/api/admin/orders/export/route.ts`. "Sync from Shopify": `app/api/admin/orders/sync/route.ts` → `lib/shopify/sync-orders.ts` (see §6.3).

**Products** — `/admin/products`, `[id]`, `new`, `import`, `inventory`, `inventory/history`. Actions across `products/[id]/actions/{core,media,variants,inventory,delete,duplicate,complementary}.ts` and `products/actions/bulk.ts`. All `requireFullAdmin()`-gated. Inventory adjustment routes through `lib/admin/inventory-ledger.ts`, writing to the shared `inventory_movements` ledger used by every inventory-affecting path in the system (sale, cancellation, return, manual adjustment, received stock, damage, correction, initial import). CSV import is a preview→commit wizard (`app/api/admin/products/import/{preview,commit}`).

**Collections** — `/admin/collections`, `[id]`, `new`. Membership (`collection_products`, position-ordered, drag-reorderable), tile-group editor (`collection_tile_items`, keyed by `template_suffix`). Removing a product runs `checkCollectionDiscountImpact` (`lib/admin/discount-guard.ts`) first and warns if an active discount targets it.

**Product templates** — `/admin/product-templates`, `[id]`, `new`. Per-category PDP content editor (see §5.4).

**Customers** — `/admin/customers`, `[id]`, `new`, `import`. GDPR logic in `lib/admin/gdpr.ts`: `anonymizeCustomer` scrubs PII but never touches `orders`/`payments` (accounting-record retention); hard delete refuses if the customer has order history. Both write a `customer_data_requests` accountability row. Saved views double as basic customer segments (stat-based filters: spend, order count, country).

**Discounts** — `/admin/discounts`, `[id]`, `new`. Supports `order_percentage` and `bxgy` shapes, automatic or code-based. Redemption reporting (`lib/admin/discount-stats.ts`) only attributes revenue to orders where the discount was the *sole* one redeemed (stacked orders counted separately, since `discount_redemptions` has no per-discount amount split).

**Reviews** — `/admin/reviews`, `[id]`, `new`. Moderation lifecycle (`pending`/`approved`/`rejected`), merchant replies, manual creation with real-order-verified `verified_buyer` computation.

**Storefront visual editor** — `/admin/storefront`, `/storefront/history`, `/storefront/menus`. See §5.5 for the precise draft/publish model.

**Settings** — `/admin/settings` (business info/VAT/logo), `/shipping`, `/carriers`, `/payments` (read-only live Stripe status + payments ledger), `/marketing` (Pixel/GA4/CAPI), `/redirects` (feeds `middleware.ts`'s `url_redirects` lookup).

**Staff** — `/admin/staff`: invite (real Supabase `auth.admin.inviteUserByEmail`), role change, disable, remove — all `role==="admin"`-only, with guards against ever leaving zero active admins and against self-demotion/self-disable/self-removal.

**Security** — `/admin/security`: self-service TOTP MFA enrollment via Supabase Auth (no way for an admin to *require* MFA on other staff — a known limitation, see §10).

### 4.5 UI conventions

- List filter-bar pattern: `lib/admin/{orders,products,customers,discounts,reviews}-filters.ts`, each exporting `parse*ListFilters`/`apply*ListFilters` shared verbatim between the list page and its export route (so what's shown and what's exported can never drift). All tables are hand-written HTML, not a grid library.
- `@dnd-kit` powers reordering in: product-media-manager, collection-products-manager, product-complementary-manager, storefront section editor, menu-item-list.
- `@tiptap` backs one shared `components/admin/rich-text-editor.tsx` used everywhere HTML content is edited.

### 4.6 Tables touched by the admin

`addresses`, `admin_users`, `audit_log`, `collection_products`, `collection_tile_items`, `collections`, `content_pages`, `customer_data_requests`, `customer_order_stats` (view), `customer_saved_views`, `customers`, `discount_redemptions`, `discounts`, `email_templates`, `fulfillment_items`, `fulfillments`, `inventory_movements`, `marketing_settings`, `media`, `newsletter_subscribers`, `order_items`, `orders`, `payments`, `product_complementary`, `product_templates`, `product_variants`, `products`, `refund_items`, `refunds`, `return_items`, `returns`, `reviews`, `shipping_carriers`, `shipping_rates`, `shipping_zones`, `store_settings`, `storefront_layout_versions`, `storefront_layouts`, `storefront_menu_items`, `storefront_menus`, `url_redirects`.

---

## 5. Product / Catalog System

### 5.1 Read path (`lib/queries.ts`)

- **`getProductByHandle`** (`cache()`-wrapped): one query selecting the product plus nested `media`/`product_variants`/`reviews` via real FKs (one round trip, not two). Builds `images` (sorted by `media.position`, each through `mediaUrl()`) and `variantImageIndex: Record<variantId, imageIndex>` — built purely from the real `media.variant_id` FK (Shopify's own `variant.image` link), letting the PDP gallery jump to the correct photo per selected variant/color. Also `sizeOptions` (distinct `option1` values).
- **`getAllProductCards` / `getCollectionProductCards`**: list active products, each reduced via the shared `toCard()` helper into a `ProductCard` — picks the **cheapest variant** for display price/compare-at, builds a per-card `imageByVariantId`, computes `available = variants.some(variantAvailable)`.

### 5.2 Availability logic — `lib/inventory.ts`

```ts
export function isVariantAvailable(v: VariantAvailability, qty: number): boolean {
  if (v.productStatus !== "active") return false;
  if (!v.inventoryTracked) return true;
  if (v.inventoryPolicy === "CONTINUE") return true;
  return v.inventoryQuantity >= qty;
}
```
Pure, no imports, used identically on the PDP, in `computeCheckoutTotals`, and in the webhook. This single function exists because a real catalog-wide bug (§7) came from checking `inventory_quantity > 0` alone, which is wrong for both untracked variants and `CONTINUE`-policy variants (Shopify's "continue selling when out of stock").

### 5.3 Pricing

Taken directly from the cheapest variant's `price`/`compare_at_price` columns at the card level — no derived discount math there. Real discount math only ever happens server-side at checkout time, in `computeCheckoutTotals` (§2.2).

### 5.4 Product templates — per-category PDP content (`lib/product-templates.ts`)

`getProductTemplateContent(templateSuffix)` queries the `product_templates` table. The join on `key` is deliberately a **soft string match**, not a hard FK, against `products.template_suffix`/`collections.template_suffix` — so a stray non-matching suffix silently returns `null` instead of breaking anything. Returns `introParagraph`, `trustLines`, `uspBlock`, `faq`, `descriptionHeading`, `accordionRows`, `sizeGuideHref`, `offerMessage` (jsonb, optional `href`), `showInventoryStatus`, `galleryLayout`. Real template keys and product counts (verified against the raw Shopify export): `armband` (216), `orhangen` (38), `halsband` (34), `ringar` (32), `erbjudande-vaskor` (32, bags with the free-wallet promo), `planbok` (16, wallets), `vaskor` (6, plain bags), `skal` (1).

### 5.5 Storefront visual editor's draft/publish model (precise)

`storefront_layouts` holds exactly two rows per page (`status='draft'` / `status='published'`), each a `sections` JSON array. Every section edit (reorder/visibility/config/add/delete) writes **only** the draft row — the live site never sees it. `publishHomeLayout` copies draft → published **and** inserts an immutable snapshot into `storefront_layout_versions` (auto-incrementing `version`). `discardDraft` overwrites draft with the current published state. Restoring an old version copies it back onto the **draft** only — it still requires a fresh Publish click to go live. `updateSectionConfig` validates config per section type (e.g. a `product_list` section's `collectionHandle` must resolve to a real collection) before saving, so a typo can never silently land. Menus (`storefront_menus`/`storefront_menu_items`) have **no** draft/publish split — edits are live immediately.

### 5.6 Media storage

Bucket: `product-media` (single bucket for everything). URL builder: `lib/supabase/media.ts`'s `mediaUrl(path) = "${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}"`. See §1.3 for the width-tiered WebP pipeline.

### 5.7 Identifying handbag ("Väska") products — for the new store's export

**Verified three independent ways, all agreeing on exactly 38 products:**
1. **By title/handle**: 38 products contain "väska"/"vaska" in the title and handle (e.g. `bk-vaska`, `bk-vaska-1`…`bk-vaska-9`).
2. **By `template_suffix`**: `erbjudande-vaskor` (32) + `vaskor` (6) = **38**.
3. **By collection**: the real collection **`vaskor-och-tillbehor`** (title "Väskor") has exactly 38 member products, cross-referenced 100% as bag titles with zero non-bag products mixed in.

**Recommended export query**: filter `products` joined to `collection_products`/`collections` where `collections.handle = 'vaskor-och-tillbehor'` — equivalently `products.template_suffix IN ('vaskor', 'erbjudande-vaskor')`, or `products.handle ILIKE '%vaska%'`. All three give the identical 38-row set.

**Do not confuse with these non-bag categories**: `tillbehor` ("Tillbehör"/Accessories, 17 products, mostly wallets — these are what's given away *free* in the bag promo, not bags), `noelle-mini-vaskor` (5, a utility sub-collection excluded from real-category nav logic), `meta-vaskor` (42 — an ads/Meta-catalog-sync utility collection, confirmed *not* the same 38-product set).

**⚠️ Important for any new catalog-identification logic**: `products.product_type` is **confirmed empty on all 376 products** in the real export — do not rely on it for categorization in a new build either; use collection membership or `template_suffix` instead.

---

## 6. All Previous Technical Fixes — Lessons From Git History

94 commits, researched via `git log` and `docs/*.md`. The project moved through roughly six phases: (1) read-only Shopify migration audit/extraction, (2) Supabase data layer + import pipeline, (3) the Next.js storefront build + a full parity-restoration pass against the real Shopify theme, (4) standing up Stripe-only commerce (kept non-public behind a flag), (5) a large admin-dashboard build-out (orders, products, customers, discounts, reviews, visual editor, staff/security, settings), (6) marketing/analytics integrations, 17TRACK tracking, and final UX/performance refinement rounds.

### 6.1 Real root-caused bugs worth remembering

1. **Missing `generateStaticParams` silently broke ISR caching** (`7ccb253`) — `export const revalidate = 60` on `/products/[handle]` and `/collections/[handle]` was silently inert the entire time, because Next.js 15 requires `generateStaticParams` for a dynamic segment to be cache-eligible at all. Confirmed via direct `cache-control: private, no-store` / `x-vercel-cache: MISS` header inspection. Fixed by adding it, prerendering 324 products + 32 collections. **Called the single highest-leverage fix in the project's history.**

2. **Order-count discrepancy (283 vs. 400) from a silently-restricted Shopify scope** (`f0e98e5`, `docs/order-reconciliation-report.md`) — the migration app's `read_orders` scope (lacking `read_all_orders`) silently restricts visibility to a rolling ~60-day window with **no error signal**. A broader-scoped connection confirmed 400 was correct; a prior report had wrongly concluded 3 orders were "deleted" when they had simply aged out of the moving window. **Lesson: multiple query variants agreeing with each other proves nothing if they all share the same restricted scope — verify against an independently-sourced total.**

3. **Catalog-wide inventory-tracking bug blocking purchasable, untracked variants** (`2198b9d`, `docs/inventory-tracking-audit.md`) — `inventoryItem.tracked` was captured in the raw export but never imported; every availability check used only raw `inventory_quantity`, wrongly blocking 201 of 788 variants that were deliberately untracked in Shopify. Fixed via migration `0008` + a live re-pull + the single shared `isVariantAvailable()` (§5.2). A first backfill attempt matched on the wrong ID format and silently updated zero rows — caught before being trusted.

4. **Shared-media unique-constraint silently dropped images** (`6a43609`) — `media.shopify_id`'s original unique constraint broke whenever an image (92/662) was shared across multiple products, since a duplicate `shopify_id` in one upsert batch can't affect the same conflicting row twice. Fixed with a composite `(shopify_id, product_id)` unique constraint (migration `0002`) + backfill.

5. **Vercel Image Optimization quota exhaustion** (`988d1e4`) — hit 100% of the Hobby plan's 5,000/month transformation quota, risking suspension. Root cause: every `next/image` instance routed through Vercel's optimizer by default. Fixed with the custom loader (§1.3) bypassing it entirely — this is a structural fix, not a quota increase, so it holds regardless of traffic.

6. **Checkout-breaking `orders.source` NULL bug, caught before production** (`7cb1fa7`) — a later migration made `orders.source NOT NULL`, but the checkout route's insert never set it, which would have 500'd on the first real customer payment. Caught by a non-charging checkout-readiness test, not in production.

7. **Supabase SSR password-recovery flow mismatch** (`5d68f9d`) — `@supabase/ssr`'s `createAuthBrowserClient()` hardcodes PKCE flow (`?code=`), but Supabase's recovery links use the implicit-flow `#access_token=...&type=recovery` hash fragment, so reset links always looked invalid. Fixed by using a plain `supabase-js` client with `detectSessionInUrl: true` for that one page.

8. **17TRACK status-mapping bugs, two rounds** (`df30c03`, `39e7289`) — 17TRACK's real `sub_status` carries a `"<MajorStatus>_<Variant>"` suffix (e.g. `"Delivered_Other"`); exact-string matching against bare `"Delivered"` left delivered packages stuck mid-progress. First fix patched one case; a second pass found more variants still broken and replaced every per-prefix check with one shared `majorStatus()` extraction. **Lesson: don't patch one instance of a bug class — find and fix the whole class.**

9. **Image letterboxing after a crop fix** (`ecf3d86`) — fixing cropping by switching to `object-contain` introduced grey letterboxing because containers used a `4:5`-ish aspect ratio while 660/661 real photos are actually square. Fixed by matching container aspect to the real images (`aspect-square`), keeping the one known non-square photo as an accepted trade-off.

10. **Preview content fabrication caught by cross-checking against the real Shopify export** (`4a85abd`) — found mislabeled products and fabricated prices on early homepage mockups; fixed by verifying every hardcoded value against `data/exports/products.jsonl`. **Lesson: never invent product copy/prices — always verify against the real source data.**

### 6.2 Performance optimizations made (reusable patterns for a new build)

- `generateStaticParams` + ISR for product/collection pages (§6.1.1).
- Root-layout data caching via `unstable_cache` (menus, logo, marketing IDs, gift-box product — 4 live queries that ran on *every* request, including uncacheable ones).
- `CartContext` split into actions/state contexts to stop unrelated cart-state changes re-rendering every product card on screen.
- Middleware redirect lookup cached 60s in-memory (avoids a Supabase round trip on every single page prefetch).
- Query merging (`getProductByHandle` + reviews via FK embed instead of two round trips) and parallelization (`Promise.all` for related-product collection lookups).
- `<Suspense fallback={null}>` streaming for related/complementary products and subcategory tiles, so the main page content never waits on the slowest async block.
- React `cache()` wrapping for `getProductByHandle`/`getCollectionMeta`/`getPageContent` to dedupe identical calls made independently by `generateMetadata()` and the page component.
- Pending-state UX (`useLinkStatus`-based) to prevent duplicate submissions / blank-flash transitions on cart/checkout buttons.

### 6.3 Hard-won rules worth repeating to a new engineer

- **Pennywise (a Shopify bundle-pricing app) is permanently excluded** — never migrated, never reimplemented, raw metafield data kept only for backup/audit.
- **Never invent product copy, prices, or titles** — always cross-check against real source data.
- **Never silently fix a flagged content inconsistency — get explicit approval first.**
- **Verify against an independently-sourced total, not just internal self-consistency** (the 283-vs-400 lesson).
- **`app/api/checkout/route.ts`, the Stripe webhook, and `lib/discounts.ts` are the most sensitive files in the project** — diffed byte-for-byte before virtually every unrelated commit; changes to them are reserved for separate, deliberate approval.
- **Checkout activation (`NEXT_PUBLIC_CHECKOUT_ENABLED`) is a human business decision, not an engineering one.**
- **A migration/backfill script that silently updates 0 rows must be caught before its output is trusted.**
- **Don't trust a "fixed" bug until verified against a real-world report** — fix the whole bug class, not one instance.
- **Marketing/CAPI routes must be safe no-ops when unconfigured, never fabricate success, and never trust client-supplied amounts.**
- **Secrets are never redisplayed or logged** — audit log entries store only booleans (`configured: true/false`), never actual values.
- **Theme/design source code from the original Shopify theme is reference-only, never ported verbatim** (commercial licensing).

---

## 7. Database

### 7.1 Migration inventory

38 files in `supabase/migrations/`, numbered `0001`–`0039` (**`0036` does not exist** — a real gap in the sequence, not a listing artifact). Full file-by-file summary:

| File | Summary |
|---|---|
| `0001_initial_schema.sql` | Full base schema (see §7.2) — already includes discounts, storefront_sections, full commerce + admin/audit tables, `is_admin()`, initial RLS. |
| `0002_media_shared_images.sql` | `media` unique constraint `shopify_id` → `(shopify_id, product_id)` (shared-image fix). |
| `0003_contact_submissions.sql` | `+contact_submissions`. |
| `0004_stripe_commerce.sql` | Stripe IDs on `orders`/`payments`; `+webhook_events`; BXGY/discount-mechanics columns on `discounts`; `+discount_redemptions`. |
| `0005_inventory_decrement_function.sql` | Original 2-arg `decrement_inventory()`. |
| `0006_store_settings.sql` | `+store_settings`, seeds `vat_rate_percent`. |
| `0007_order_shipping_address.sql` | `addresses.order_id`, `orders.shipping_address_id`. |
| `0008_inventory_tracked.sql` | `product_variants.inventory_tracked`. |
| `0009_force_decrement_inventory_function.sql` | Original 2-arg `force_decrement_inventory()`. |
| `0010_template_suffix.sql` | `products.template_suffix`, `collections.template_suffix`. |
| `0011_newsletter_subscribers.sql` | `+newsletter_subscribers`. |
| `0012_phase2_order_management.sql` | `orders.source`/`cancelled_by`; `order_items.fulfilled_quantity`/`refunded_quantity`; `fulfillments.shipped_at`/`delivered_at`/`created_by`; `+fulfillment_items`, `+refund_items`, `+return_items`; `refunds.stripe_refund_id`/`kind`/`created_by`; `returns.resolution`/`restocked_at`/`created_by`. |
| `0013_phase3_catalog_schema.sql` | `product_variants.weight`/`weight_unit`; `products.source`/`collections.source`; `+inventory_movements`; `+product_templates`; `+collection_tile_items`; re-creates both inventory functions with default params + ledger writes. |
| `0014_phase3_inventory_note.sql` | `force_decrement_inventory` gains `p_note`. |
| `0015_fix_inventory_function_overload_ambiguity.sql` | Drops superseded overloads (bugfix). |
| `0016_phase4_customer_management.sql` | `customers.source`/`anonymized_at`/`deletion_requested_at`; role CHECK on `admin_users`; `+customer_saved_views`; `+customer_order_stats` VIEW; `+customer_data_requests`. |
| `0017_fix_customer_data_requests_fk.sql` | `customer_data_requests.customer_id` FK → `ON DELETE SET NULL`. |
| `0018_phase5_discounts_constraints.sql` | CHECK constraints on `discounts.kind`/`status`. |
| `0019_phase6_reviews.sql` | Moderation/reply columns on `reviews`; public-read policy → `status='approved'`. |
| `0020_phase7_storefront_editor.sql` | `+storefront_layouts`, `+storefront_layout_versions`, `+storefront_menus`, `+storefront_menu_items`. |
| `0021_phase7_storefront_seed.sql` | Seeds the real 16-section homepage + 5 real menus. |
| `0022_settings_redirects.sql` | Seeds `store_settings` business keys; `+url_redirects`. |
| `0023_shipping_settings.sql` | Seeds flat-rate shipping keys (later superseded by `0029`/`0030`). |
| `0024_phase3_staff_security.sql` | `admin_users.disabled`/`invited_by`. |
| `0025_phase4_content_pages.sql` | `+content_pages`. |
| `0026_phase4_content_pages_seed.sql` | Seeds 7 real content pages. |
| `0027_phase5_email_templates.sql` | `+email_templates` (draft/live split). |
| `0028_phase5_email_templates_seed.sql` | Seeds 3 email templates. |
| `0029_phase_shipping_zones_carriers.sql` | `+shipping_zones`, `+shipping_rates`, `+shipping_carriers`. |
| `0030_phase_shipping_zones_carriers_seed.sql` | Seeds Sverige/SE zone + carriers; retires old shipping keys. |
| `0031_phase_marketing_settings.sql` | `+marketing_settings`. |
| `0032_phase_wallet_promo_link.sql` | Data-only: `href` added to `product_templates.offer_message` for `erbjudande-vaskor`. |
| `0033_phase_product_complementary.sql` | `+product_complementary` ("Passar med"). |
| `0034_phase_order_tracking.sql` | `shipping_carriers.tracking_api_carrier_code`; `+tracking_cache`, `+tracking_lookup_attempts`. |
| `0035_phase_order_management_advanced.sql` | `orders.hidden_at`/`hidden_by` (soft delete). |
| `0037_phase_fulfillment_staff_role.sql` | Adds `fulfillment_staff` role; `admin_users.locale`. |
| `0038_order_cancellation_email_template.sql` | Adds `order_cancellation` email template key + seed. |
| `0039_order_applied_discounts.sql` | `orders.applied_discounts jsonb` (display-only). |

### 7.2 Core schema (from `0001`, abbreviated to essential columns — see migration file for full DDL)

```sql
locations(id, shopify_id unique, name, is_active, city, country_code, created_at)
collections(id, shopify_id unique, title, handle unique, description_html, sort_order,
            image_url, seo_title, seo_description, created_at, updated_at)
products(id, shopify_id unique, title, handle unique, status default 'active', product_type,
         vendor, description_html, tags text[], seo_title, seo_description, published_at,
         created_at, updated_at)                                    -- index on status
product_variants(id, shopify_id unique, product_id -> products CASCADE, title, sku, barcode,
                  price numeric(10,2), compare_at_price, inventory_quantity default 0,
                  inventory_policy, taxable default true, option1, option2, option3, created_at)
media(id, shopify_id unique, product_id -> products CASCADE, variant_id -> product_variants SET NULL,
      storage_path, alt_text, width, height, position default 0, created_at)
collection_products(collection_id, product_id, position default 0, PK(collection_id, product_id))
reviews(id, source_review_id unique, product_id -> products CASCADE, rating CHECK 1-5,
        author_name, body, verified_buyer default false, created_at)
discounts(id, shopify_id unique, title, kind, code, status default 'active', value_type, value,
          starts_at, ends_at, created_at)                           -- extended heavily in 0004/0013
storefront_sections(id, type, position, is_visible, content jsonb, created_at, updated_at)  -- superseded by 0020
customers(id, shopify_id unique, auth_user_id -> auth.users SET NULL, email, first_name,
          last_name, phone, accepts_marketing, marketing_consent_updated_at, note, tags text[],
          created_at, updated_at)
addresses(id, shopify_id unique, customer_id -> customers CASCADE, first_name, last_name,
          company, address1, address2, city, province, province_code, zip, country,
          country_code, phone, is_default)
carts(id, customer_id -> customers SET NULL, session_token unique, status default 'active', ...)
cart_items(id, cart_id -> carts CASCADE, variant_id -> product_variants, quantity CHECK > 0, ...)
orders(id, shopify_id unique, customer_id -> customers SET NULL, order_number, email, phone,
       currency_code default 'SEK', financial_status, fulfillment_status, subtotal_price,
       total_shipping, total_tax, total_discounts, total_price not null, note, tags text[],
       cancelled_at, cancel_reason, processed_at, created_at)
order_items(id, shopify_id unique, order_id -> orders CASCADE, variant_id -> product_variants SET NULL,
            product_id -> products SET NULL, title not null, sku, quantity, unit_price,
            discounted_unit_price)
inventory_levels(id, variant_id -> product_variants CASCADE, location_id -> locations CASCADE,
                  available default 0, UNIQUE(variant_id, location_id))
payments(id, shopify_id unique, order_id -> orders CASCADE, kind, status, gateway, amount,
         currency_code, processed_at, stripe_payment_intent_id)
fulfillments(id, shopify_id unique, order_id -> orders CASCADE, status, tracking_number,
             tracking_url, tracking_company, created_at)
returns(id, order_id -> orders CASCADE, status default 'requested', reason, created_at)
refunds(id, shopify_id unique, order_id -> orders CASCADE, return_id -> returns SET NULL,
        amount not null, reason, created_at)
admin_users(id, auth_user_id unique -> auth.users CASCADE, role default 'admin', created_at)
audit_log(id, actor_id -> admin_users SET NULL, action not null, entity_type, entity_id,
          detail jsonb, created_at)
```

**No `*_shopify_id_map` tables exist anywhere** — the Shopify ID is kept directly on each row as a `shopify_id unique` column (deliberate design choice, stated in `0001`'s own header comment).

### 7.3 `shopify_id`-bearing tables (confirmed, full list)

`locations`, `collections`, `products`, `product_variants`, `media`, `discounts`, `customers`, `addresses`, `orders`, `order_items`, `payments`, `fulfillments`, `refunds`. (No `shopify_id` on `cart_items`, `carts`, `collection_products`, `inventory_levels`, `returns`, `reviews` — `reviews` uses `source_review_id` instead.) A `source` column (`'shopify'|'stripe'|'manual'`) was added later on `orders`/`products`/`collections`/`customers` to let Shopify-origin and Stripe/manual-origin rows coexist cleanly in the same tables.

### 7.4 Row-Level Security pattern

`is_admin()` (SQL, `security definer stable`): `exists(select 1 from admin_users where auth_user_id = auth.uid())` — the universal admin-bypass predicate.
- **Public read, unconditional**: `locations`, `product_variants`, `media`, `collection_products`, `inventory_levels`, `store_settings`, `url_redirects`, `storefront_menus`/`items`, `product_templates`, `collection_tile_items`, `product_complementary`, `content_pages`.
- **Public read, status-gated**: `products` (`status='active' OR is_admin()`), `discounts` (same), `reviews` (`status='approved' OR is_admin()`), `storefront_layouts`/`sections` (`status='published' OR is_admin()`).
- **Own-row** (customer-scoped via `auth_user_id`/`customer_id`): `customers`, `addresses`, `orders`, `order_items`, `carts`, `cart_items` — always with `is_admin()` as an escape hatch.
- **Admin-only, `for all using (is_admin())`**: `payments`, `fulfillments`, `returns`, `refunds`, `admin_users`, `audit_log`, `webhook_events`, `discount_redemptions`, `inventory_movements`, `fulfillment_items`, `refund_items`, `return_items`, `customer_saved_views`, `customer_data_requests`, `storefront_layout_versions`, `marketing_settings`, `tracking_cache`, `tracking_lookup_attempts`, `shipping_zones`, `shipping_rates`, `shipping_carriers`, `email_templates`.
- **Admin write + public read**: `locations`, `collections`, `products`, `product_variants`, `media`, `collection_products`, `discounts`, `storefront_sections`, `inventory_levels`, `store_settings`, `url_redirects`, `storefront_layouts`, `storefront_menus`/`items`, `product_templates`, `collection_tile_items`, `content_pages`, `reviews`, `product_complementary`.
- **Public insert / admin read**: `contact_submissions`, `newsletter_subscribers`.
- **Special case**: `tracking_cache`/`tracking_lookup_attempts` carry admin-only RLS, but the real public order-lookup route (§10) deliberately uses the **service-role client** (bypasses RLS) — a guest looking up an order by number+email has no Supabase Auth identity to scope RLS against.

### 7.5 Database functions

| Function | Defined | Purpose |
|---|---|---|
| `is_admin()` | `0001` | RLS admin predicate |
| `decrement_inventory(variant_id, qty, reason='sale', order_id=null, actor_id=null)` | `0005`, extended `0013` | Atomic check-and-decrement (single UPDATE with `WHERE inventory_quantity >= qty`), writes an `inventory_movements` row on success |
| `force_decrement_inventory(variant_id, qty, reason='manual_adjustment', order_id=null, actor_id=null, note=null)` | `0009`, extended `0013`/`0014` | Unconditional decrement (no stock check, can go negative), same ledger write |
| `customer_order_stats` | `0016` | VIEW (`security_invoker`), not a function — per-customer LTV/order-count/last-order, case-insensitive `financial_status` matching, email-fallback for guest orders |

(`0015` is a pure cleanup migration dropping superseded function overloads after `create or replace` failed to replace functions whose signature had changed — a real production bug, not schema.)

### 7.6 Scheduled jobs

**None found.** There is no pg_cron, no Supabase Edge Function scheduler, and no background job runner anywhere in this codebase. Every "sync" mechanism (Shopify order sync, 17TRACK registration/polling) is either **admin-button-triggered** or **triggered inline by a real user/admin action** (e.g., tracking registration fires via Next's `after()` at fulfillment-creation time, not on a timer). If a new build wants scheduled background sync, that infrastructure needs to be added from scratch.

### 7.7 Synchronization mechanisms (Shopify → Supabase)

See §6.3 below for the full detail — summarized here: `scripts/shopify/*.ts` (one-time historical extraction + CLI reconciliation tools) and `app/api/admin/orders/sync/route.ts` → `lib/shopify/sync-orders.ts` (the live admin "Sync from Shopify" button, orders-only, idempotent `shopify_id`-keyed upsert).

---

## 8. Deployment

### 8.1 Current reality

- **Platform**: Vercel, project `am-207d/jawhara`, **Hobby (free) plan**.
- **Production domain**: `jawhara.se` (confirmed as both the original Shopify store's domain and the current live alias).
- **Git branch deployed**: `claude/festive-pasteur-77mezq`.
- **Checkout flag**: `NEXT_PUBLIC_CHECKOUT_ENABLED=false` in production, by deliberate standing decision — never flipped on for live customer traffic as of the most recent verification report reviewed in this research pass.

### 8.2 Environment variables that must be set on a new deployment

Grouped by what they're for (see §1.6 for the full per-variable file references):

**Required for the app to function**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_CHECKOUT_ENABLED`, `NEXT_PUBLIC_SITE_URL`.

**Required only for local scripts/CLI tooling, never pushed to the deployed app**: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SUPABASE_ACCESS_TOKEN` (Management API, for DDL migrations run from a dev machine).

**Optional / feature-specific**: `SEVENTEENTRACK_API_KEY` (order tracking — app degrades gracefully without it, see §10).

**Not an env var at all**: Meta Pixel ID / CAPI token / GA4 ID — these are set via the `/admin/settings/marketing` UI into the `marketing_settings` table, not `.env`.

### 8.3 How to reproduce this infrastructure in a completely independent set of accounts

1. **Supabase**: create a new project (EU region recommended for GDPR if serving EU customers, as this project did). Apply all 38 migrations in `supabase/migrations/` **in order** (note the real `0036` gap — don't try to create a file for it, just apply what exists in sequence). Migrations were applied in this project via Supabase's HTTPS Management API (`scripts/supabase/db.ts`'s `runSql()`) rather than a direct Postgres TCP connection, because the dev sandbox environment can't make direct DB connections — a real local machine or CI runner can likely use the Supabase CLI's `supabase db push` directly instead; either approach ends at the same schema.
2. **Storage**: create a `product-media` bucket (public read).
3. **Stripe**: create a new Stripe account (or a new restricted-key integration under an existing one), get a fresh `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` pair. Register a webhook endpoint pointed at `https://<your-domain>/api/webhooks/stripe` for `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`, and copy the resulting `whsec_...` into `STRIPE_WEBHOOK_SECRET`. (This project's own runbook for this exact step: `docs/stripe-webhook-vercel-runbook.md`.)
4. **Resend**: create an account, verify a sending domain, get `RESEND_API_KEY`.
5. **Vercel (or any Next.js host)**: set every env var from §8.2 **before the first build** (Next.js inlines `NEXT_PUBLIC_*` values at build time — setting them after a build won't retroactively fix the client bundle). Set `NEXT_PUBLIC_CHECKOUT_ENABLED=false` until deliberately ready to go live.
6. **First admin user**: there is no seed script for this — create a Supabase Auth user (via the Supabase dashboard or `auth.admin.createUser`), then manually insert a matching row into `admin_users` with `role='admin'` via the Supabase SQL editor (chicken-and-egg: the staff-invite *feature* requires an existing admin to use it).
7. **Shopify (only if reusing the original data-migration approach)**: create a Dev Dashboard app on the new/source Shopify store with the OAuth client-credentials grant type and `read_orders`/`read_products`/etc. scopes (consider requesting `read_all_orders` from the start this time, to avoid the 60-day-window trap documented in §6.1.2). Set `SHOPIFY_STORE_DOMAIN`/`SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` as **local-only** env vars (never push these to the production deployment — they're not read by the deployed app at all, only by local/CI scripts).
8. **Image pipeline**: no external service needed — `sharp` runs the WebP variant generation locally/in the upload route; just make sure the hosting platform's Node runtime includes `sharp`'s native binary for its target platform (Vercel handles this automatically for supported runtimes).
9. **Proxy setup (§1.7)**: skip entirely unless deploying inside a similarly network-sandboxed environment. Real hosting (Vercel, etc.) needs none of the `ProxyAgent` code to function — it's already a no-op there (`if (proxyUrl)` guards all of it).

### 8.4 Known deployment gotchas from this project's own history (avoid repeating)

- Vercel's "Secret"-type environment variables are **write-only** — you cannot read a previously-set secret back through the dashboard or API. If you need to verify a webhook secret later, you may need to rotate it rather than retrieve it.
- `NEXT_PUBLIC_*` vars must be set **before** the build that will use them — setting them after deployment requires a full rebuild, not just an env var change (though a Vercel env var change does trigger a redeploy automatically, which handles this correctly if you remember to wait for it).
- Vercel's Hobby plan does not actually provide the "Vercel Authentication" (SSO) deployment-protection feature — that's Pro-tier only; don't assume an unlisted Hobby-plan URL is protected by anything beyond obscurity.
- Watch your Image Optimization transformation quota on the Hobby plan if you do *not* carry over the custom image loader from this project — it's easy to exhaust 5,000/month on a real product catalog with many images at multiple breakpoints. Strongly recommend reusing `lib/image-loader.ts` + the width-tiered upload pipeline (§1.3) rather than relying on Vercel's built-in optimizer.

---

## 9. New Store Implementation — Specific Instructions

### 9.1 What to reuse as-is (proven, working, low-risk to carry over)

- **The entire Supabase schema** (§7) — directly reusable; it's catalog-platform-agnostic (nothing bag-specific or Jawhara-specific is baked into table structure).
- **The Stripe checkout engine** (§2) — `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/discounts.ts`, `lib/inventory.ts`, `lib/inventory/{consume,restock}.ts`, `lib/orders/refund-guard.ts`. Swap in a new Stripe account's keys; the logic itself is generic commerce, not Jawhara-specific.
- **The entire admin dashboard** (§4) — genuinely reusable wholesale; nothing in it assumes jewelry vs. handbags.
- **The image pipeline** (§1.3, §5.6) — reuse directly, just point at a new Supabase Storage bucket.
- **The transactional email system** (§2.8) — reuse the template-editor architecture; **rewrite the actual template copy/branding** for the new store (never carry over Jawhara's literal wording).
- **The 17TRACK integration** (§10) — reuse directly once you have your own API key.
- **The product/catalog read path and template-content system** (§5) — reuse the architecture (`product_templates`, `collection_tile_items`, availability logic); the actual seeded category content needs to be rewritten for handbags.

### 9.2 What needs new, independent configuration (do not share with the old Jawhara deployment)

- **A new Supabase project** — never point a new store at the existing Jawhara database.
- **A new Stripe account/integration** — separate funds flow, separate webhook secret.
- **A new Shopify store** (if used at all — see §0's caveat about what "Shopify" means here) **purely as a data source for the one-time catalog extraction**, using the same read-only Admin API pattern as §6.3 below — **not** as a live checkout mechanism, unless you deliberately decide to build real Shopify Storefront API checkout from scratch (which this codebase has no existing implementation of to copy from).
- **A new Meta Pixel + Business account** — new Pixel ID, new CAPI access token, set via the `/admin/settings/marketing` UI exactly as this project's own admin does. **Per this task's explicit instruction, do not create/configure any Meta product catalog as part of this research — that's a deliberate later step**, but the codebase's `/feed/products.xml` (§3.6) is ready to be pointed at a catalog whenever that step happens.
- **A new Resend account/domain** — new sending domain verification, new API key.
- **A new Vercel project (or other host) + new production domain.**

### 9.3 Importing only handbag products from a source Shopify store

Reuse the extraction pattern in `scripts/shopify/extract/products.ts` (Admin GraphQL, OAuth client-credentials grant — see `scripts/shopify/client.ts` for the exact auth mechanism) to pull the full catalog, then filter using the verified pattern from §5.7: filter to products where `collections.handle` matches your source store's real bag collection (or by `template_suffix` if the new source store has an equivalent field, or by a handle/title pattern like `%bag%`/`%handbag%` for an English-language store). **Do not assume `product_type` is populated** — verify against the real export first, exactly as this research did for Jawhara (§5.7's finding that `product_type` was empty on all 376 Jawhara products should not be assumed true of a different store, but it's a documented failure mode worth checking for, not assuming away).

### 9.4 Building the new frontend

Nothing in `app/(storefront)/**` is architecturally required to look like Jawhara — it's a normal Next.js App Router storefront reading from the same `lib/queries.ts`-style data layer. A new, completely different frontend can be built against:
- The same `products`/`product_variants`/`collections`/`media` tables and `lib/queries.ts`-equivalent read functions.
- The same `CartProvider` pattern (`components/cart/cart-provider.tsx`) and `/api/cart/totals` + `/api/checkout` routes, unchanged.
- A **new** design system, new components, new page layouts — none of that is coupled to the backend.

### 9.5 Configuring a new Meta Pixel (structural steps only — no catalog work)

1. Add `NEXT_PUBLIC_META_PIXEL_ID`-equivalent config — actually, following this project's own pattern, **do not** add it as an env var; set it via `/admin/settings/marketing`, writing to `marketing_settings`.
2. Fill in the new Pixel ID, a new GA4 Measurement ID (optional), and a new Meta CAPI access token.
3. Strongly consider fixing the two confirmed gaps from §3.5/§3.7 while rebuilding: (a) fire CAPI from the Stripe webhook as well as/instead of the client-triggered confirmation-page fetch, for true server-to-server reliability; (b) capture `_fbp`/`_fbc` cookies and forward `client_ip_address`/`client_user_agent` in the CAPI `user_data` payload for better Event Match Quality.
4. Leave the product feed (`/feed/products.xml`) as-is architecturally — it will automatically reflect the new handbag catalog once real products are imported. Actually connecting it to a Meta Commerce Manager catalog is an explicitly deferred, later, manual step per this task's instructions.

---

## 10. Known Limitations

Compiled from the codebase's own comments, `docs/*.md` verification reports, and this research pass's own findings. Organized by severity/relevance to a new build.

### 10.1 Checkout / commerce
- **Checkout has never been enabled for real production traffic** (`NEXT_PUBLIC_CHECKOUT_ENABLED=false` throughout) — this is a deliberate standing decision in the source project, not a bug, but a new build must explicitly decide when to flip it on.
- **Shipping is hardcoded always-free, Sweden-only** in the live pricing path, despite a fuller configurable zones/rates admin UI existing — that richer model is **not wired into `computeCheckoutTotals`**. A new store serving multiple countries or needing real shipping rates must do this wiring itself; it's explicitly unfinished, not just unconfigured.

### 10.2 Meta Pixel / Marketing (see §3.7 full table)
- CAPI is client-fetch-triggered only, not fired from the webhook — not a guaranteed server-to-server signal.
- No `fbp`/`fbc`/IP/user-agent attribution data captured anywhere.
- The admin UI's "encrypted" claim about the CAPI token is false — it's stored as plaintext.
- `PageView` doesn't refire on client-side soft navigation.
- No real Pixel ID/CAPI token/GA4 ID has ever been configured in the source project — the whole pipeline is unexercised against real Meta infrastructure.
- Product feed has no live connection to any Meta/Google catalog (deliberately out of scope here).

### 10.3 Staff / security
- Only two functionally-distinct roles today for general staff (`admin`≈`staff`, plus the narrower `fulfillment_staff`) — no granular per-permission access control.
- MFA is self-service only — an admin cannot *require* another staff member to enable it.

### 10.4 Order tracking (17TRACK)
- **Fully code-complete and wired to the real live 17TRACK REST API**, but non-functional without a provisioned `SEVENTEENTRACK_API_KEY` — the client throws explicitly if the key is absent. Degrades gracefully elsewhere (the tracking page still shows order status, just without live carrier events) — this is real, production-grade integration code sitting idle for lack of a key, not a stub.
- A corrective backfill script for ~154 fulfillments falsely marked as 17TRACK-registered (after a quota-exhaustion incident) was written but never executed — blocked on a mass-delete permission grant that was never obtained.

### 10.5 Data/sync
- **No scheduled/background jobs exist anywhere** (§7.6) — all sync is manual-trigger (admin button) or inline-at-action-time. A new build wanting automatic periodic sync needs to add this infrastructure (e.g. a Vercel Cron job or Supabase Edge Function on a schedule) from scratch.
- Shopify order sync (when relevant per §0/§9) only ever sees orders within whatever Admin API scope window is granted — request `read_all_orders` upfront to avoid the documented 60-day-window trap (§6.1.2).
- No stale-object cleanup on media edits (deleting a media row doesn't delete the underlying storage object) — a deliberate, low-risk scope cut, not a bug, but worth knowing before assuming storage usage tracks row counts.

### 10.6 Misc
- `@tanstack/react-table` is an installed dependency that is never actually used — all admin tables are hand-rolled HTML. Don't assume it's wired up if extending the admin.
- `recharts` is used in exactly one component (`sales-trend-chart.tsx`) — not a general charting layer yet.
- CSV product import has no way to explicitly clear a field to blank on update (an empty cell means "leave unchanged").
- Bulk fulfillment intentionally doesn't collect per-order tracking numbers in one action — left as a known simplification.

---

## Appendix A — Quick File-Path Reference

| Concern | Key files |
|---|---|
| Checkout | `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/discounts.ts`, `lib/stripe/server.ts` |
| Cart | `components/cart/cart-provider.tsx`, `app/api/cart/totals/route.ts` |
| Inventory | `lib/inventory.ts`, `lib/inventory/consume.ts`, `lib/inventory/restock.ts`, `lib/admin/inventory-ledger.ts` |
| Product reads | `lib/queries.ts`, `lib/product-templates.ts` |
| Image pipeline | `lib/image-loader.ts`, `lib/image-processing.ts`, `lib/supabase/upload-with-variants.ts`, `lib/supabase/media.ts` |
| Admin auth | `lib/admin/auth.ts`, `lib/admin/permissions.ts`, `middleware.ts` |
| Admin audit | `lib/admin/auth.ts` (`logAdminAction`), `lib/admin/audit-log.ts` |
| GDPR | `lib/admin/gdpr.ts` |
| Meta Pixel/CAPI | `lib/marketing/{consent,events}.ts`, `components/marketing/cookie-consent-and-tracking.tsx`, `app/api/marketing/capi-purchase/route.ts`, `lib/admin/marketing-settings.ts` |
| Email | `lib/email/*.ts`, `lib/admin/email-templates.ts` |
| Order tracking | `lib/tracking/*.ts`, `app/(storefront)/sparra-mitt-paket/page.tsx` |
| Storefront editor | `lib/admin/storefront-layout.ts`, `lib/admin/storefront-menus.ts`, `app/admin/(authenticated)/storefront/**` |
| Shopify extraction/sync | `scripts/shopify/**`, `lib/shopify/client.ts`, `lib/shopify/sync-orders.ts` |
| Database migrations | `supabase/migrations/0001`–`0039` |
| Docs (verification reports) | `docs/*.md` (24 files — see §6's docs inventory in the research notes; `docs/final-readiness-report.md` is the best single capstone summary) |

---

*Document generated by read-only codebase research. Every claim above traces to a specific file, migration, or commit in the actual repository at the time of writing. No credentials, tokens, passwords, or customer data are included anywhere in this document — only environment variable names and table/column names.*
