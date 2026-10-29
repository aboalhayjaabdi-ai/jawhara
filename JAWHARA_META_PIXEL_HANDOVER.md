# Jawhara — Meta Pixel & Conversions API Technical Handover

**Purpose:** reproduce Jawhara's exact Meta Pixel + Conversions API (CAPI) architecture for Amarenti. Written for a Claude session with no access to this project's history.

**Scope:** 100% read-only research against the real production branch. No application code, Shopify config, Supabase schema, or Meta settings were modified while writing this.

**Source verified:** branch `claude/magical-babbage-ne4n82` (the real deployed production branch — confirmed as GitHub's repo HEAD branch and as what `jawhara.se` actually serves), tip commit `92305b2` at the time of writing. Published from branch `claude/jawhara-meta-pixel-handover`, created from that same tip, containing only this one new file.

**How this was verified, concretely:** every file below was read directly from the repository at that commit (not reconstructed from memory). Every claim about "what fires," "what's captured," or "what's missing" was confirmed with a `grep` across the whole repo, not inferred from a single file. The current state of `marketing_settings`, `purchase_tracking_log`, `orders`, and `cron_sync_runs` was queried live against the production Supabase database (via the service-role REST API) on 2026-10-29 — those specific numbers are called out as **live-verified** below, separate from static code-reading.

**Hard methodological rule applied throughout:** this repository has several other `claude/*` branches. Some contain real Meta-Pixel-related commits (a `test_event_code` feature, product-feed fixes for Meta's catalog, a PageView-dedup prep commit) that are **not part of this production branch's history** — confirmed with `git merge-base --is-ancestor <commit> HEAD`, which returned false for all of them. Those are called out explicitly in §6 as *not in production* and are excluded from every other section. Nothing in this document describes a fix that isn't actually present in `claude/magical-babbage-ne4n82`.

---

## 0. The one premise correction that changes everything

Jawhara's **real checkout is not on jawhara.se at all.** Checkout happens on a **separate Shopify-hosted checkout domain** (`jawharastore.se`, confirmed in a source-code comment — `lib/marketing/capi-purchase.ts:47`). jawhara.se/www.jawhara.se is a custom Next.js storefront that syncs its cart to a real Shopify Storefront API cart and redirects the browser there for payment. **No Jawhara-controlled page ever sees the customer again after that redirect** for a real purchase — there is no return/confirmation page in the real flow.

This single fact is why the entire Meta tracking architecture is built the way it is:
- There is **no browser-side Purchase pixel event for a real sale**, because no Jawhara page runs after payment.
- The **only** Purchase signal Meta gets is a server-to-server Conversions API call, fired off a Shopify webhook once the order is confirmed paid.
- Everything else (ViewContent, AddToCart, InitiateCheckout) still fires normally from the browser, because those all happen *before* the redirect, on jawhara.se.

If Amarenti's checkout stays entirely on its own domain (Shopify hosted checkout, or any other platform's hosted page) rather than on the storefront's own domain, **this is the correct architecture to copy as-is.** If Amarenti's checkout instead stays on the storefront's own domain, the browser-side Purchase event (§3.1) becomes viable again and should be added back — it's a real, confirmed gap here (§4.3), not a deliberate omission.

---

## 1. Complete Architecture — Browser, Server-Side CAPI, and Shopify Checkout Together

### 1.1 Consent gate (everything else is downstream of this)

`lib/marketing/consent.ts` — plain `localStorage` key `jawhara_cookie_consent`, three states: `"accepted" | "rejected" | null`.

`components/marketing/cookie-consent-and-tracking.tsx` is the **one** client component that owns both the consent banner and the conditional script injection, so accepting re-renders the same component and the scripts mount on the same page load:

```tsx
const trackingActive = consent === "accepted";
{trackingActive && metaPixelId && (
  <Script id="meta-pixel" strategy="afterInteractive">
    {`
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${metaPixelId}');
      fbq('track', 'PageView');
    `}
  </Script>
)}
```
(full file at that path; GA4's two `<Script>` tags are the same pattern, gated the same way).

`metaPixelId`/`ga4MeasurementId` are passed down as props from the root layout, sourced from `getPublicMarketingIds()` (§1.4) — **both are real-but-optional strings; when either is empty, that integration's `<Script>` tags simply never render**, independent of consent.

### 1.2 Client-side events (`lib/marketing/events.ts`, full file)

Thin wrappers over `window.fbq`/`window.gtag` — every call is a safe no-op if the script hasn't loaded (no consent, or no ID configured), because `fbq`/`gtag` then just don't exist on `window`:

```ts
export function trackPageView() {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "PageView");
  window.gtag?.("event", "page_view");
  logAnalyticsEvent("page_view");
}

export function trackViewContent(params: { id: string; title: string; price: number; currency: string; productHandle?: string }) {
  window.fbq?.("track", "ViewContent", { content_ids: [params.id], content_name: params.title, content_type: "product", value: params.price, currency: params.currency });
  window.gtag?.("event", "view_item", { ... });
  logAnalyticsEvent("view_content", { productHandle: params.productHandle, productTitle: params.title });
}

export function trackAddToCart(params: { id, title, price, currency, quantity, productHandle? }) { /* AddToCart, mirrored to first-party analytics */ }

export function trackInitiateCheckout(params: { value: number; currency: string; itemCount: number }) { /* InitiateCheckout */ }

/** eventId is the SAME value sent server-side (now shopify_order_<id>, see §3.3) -- required for
 * Meta to dedupe the browser pixel event against the server event. */
export function trackPurchase(params: { eventId: string; orderNumber: string; value: number; currency: string }) {
  window.fbq?.("track", "Purchase", { value: params.value, currency: params.currency, content_name: params.orderNumber }, { eventID: params.eventId });
  window.gtag?.("event", "purchase", { ... });
}
```

Every call site passes only real, already-on-the-page data (real product price/handle, real cart contents) — nothing is invented.

**Real fire points, confirmed by `grep` (not every function above is actually called from production code):**

| Event | Real call site | Fires in the real customer flow? |
|---|---|---|
| `trackPageView` | `cookie-consent-and-tracking.tsx` (once on first load, mirroring the Pixel's own inline init script) + on every `usePathname()` change (§6, the PageView-refire fix) | ✅ Yes |
| `trackViewContent` | product detail page mount | ✅ Yes |
| `trackAddToCart` | `cart-provider.tsx`'s `addItem()` — every add-to-cart path | ✅ Yes |
| `trackInitiateCheckout` | `components/cart/cart-drawer.tsx`'s `handleCheckout()` — fired right after `goToCheckout()` succeeds, immediately before `window.location.href` leaves for Shopify | ✅ Yes — **this is the real fire point**, not the `/kassa` page (see next row) |
| `trackInitiateCheckout` (duplicate) | `app/(storefront)/kassa/page.tsx` also calls this | ❌ **Dead code** — this route's own comment states it plainly: *"This route is no longer part of the customer journey -- nothing in the app links or navigates here anymore... It only still exists so an old bookmark or a link already sent out doesn't 404."* |
| `trackPurchase` | `app/(storefront)/kassa/bekraftelse/page.tsx` | ❌ **Dead code for real sales** — this is the old Stripe-era confirmation page; checkout no longer returns here for a real Shopify purchase. Still technically reachable only from the admin's manual-order Stripe-link path (an internal tool, not the customer flow). |

**This table is the single most important correction to carry into Amarenti's build**: if Amarenti's checkout also leaves the storefront domain, don't bother wiring a browser Purchase pixel at the "confirmation page" — there usually isn't one anymore once checkout redirects elsewhere.

### 1.3 Server-side CAPI — the only real Purchase signal

`lib/marketing/capi-purchase.ts`'s `reportPurchaseToMeta()` — full function reproduced and explained in §3. Triggered exclusively from `app/api/webhooks/shopify/route.ts` (real-time) and two recovery schedulers (§5). Never from a client request.

### 1.4 Admin configuration (DB-driven, not env vars)

`lib/admin/marketing-settings.ts`, full file:

```ts
export type MarketingSettings = {
  id: string;
  metaPixelId: string | null;
  metaCapiAccessToken: string | null;
  ga4MeasurementId: string | null;
};

/** Full admin read, including the real CAPI secret -- only ever used inside admin pages/Server
 * Actions and the server-side CAPI route, never passed to client code. */
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const { data } = await supabaseService.from("marketing_settings").select("id, meta_pixel_id, meta_capi_access_token, ga4_measurement_id").limit(1).single();
  ...
}

/** Hand-picks ONLY the two non-secret IDs -- safe to pass into client code. The real CAPI access
 * token column is never selected by this function at all. */
export async function getPublicMarketingIds(): Promise<{ metaPixelId: string | null; ga4MeasurementId: string | null }> {
  const { data } = await supabaseService.from("marketing_settings").select("meta_pixel_id, ga4_measurement_id").limit(1).single();
  return { metaPixelId: data?.meta_pixel_id ?? null, ga4MeasurementId: data?.ga4_measurement_id ?? null };
}
```

**No Meta/CAPI-specific environment variable exists anywhere** — confirmed via `grep -i "meta\|pixel\|capi\|ga4"` against `.env.local.example`: zero matches. Configuration lives entirely in the single-row `marketing_settings` table, edited at `/admin/settings/marketing` (`app/admin/(authenticated)/settings/marketing/page.tsx` + `actions.ts`). The settings form's own field label reads: *"En engångs-access-token från Meta Events Manager. Sparas krypterat i databasen och visas aldrig igen i klartext här..."* (`components/admin/marketing-settings-form.tsx:113`).

**⚠️ Confirmed false claim to fix in a new build**: that label claims the token is saved "encrypted." It is **not** — `meta_capi_access_token` is a plain `text` column (confirmed: zero matches for `encrypt|decrypt|pgsodium|vault` anywhere in the repo). It's protected only by Postgres RLS (admin-only), not application-level encryption. Either implement real encryption or fix the copy when porting this to Amarenti.

---

## 2. Cross-Domain Checkout — How Tracking Survives the jawhara.se → Shopify Hop

### 2.1 The real cart→checkout flow, end to end

1. The customer shops on `jawhara.se`, built on `localStorage`-persisted cart state (`components/cart/cart-provider.tsx`) — completely independent of Shopify.
2. Every cart change (add/remove/qty/discount code) debounces 500ms and mirrors the cart to a **real Shopify Storefront API cart** via `lib/shopify/cart-sync.ts`'s `syncShopifyCart()`, which calls `lib/shopify/storefront.ts`'s hand-written GraphQL client (`cartCreate`/`cartLinesAdd`/`cartLinesRemove`/`cartDiscountCodesUpdate`, authenticated with `SHOPIFY_STOREFRONT_ACCESS_TOKEN`, API version `2026-10`).
3. Clicking "Till kassan" (`cart-drawer.tsx`'s `handleCheckout()`) calls `goToCheckout()` (`cart-provider.tsx`), which:
   - Forces one last cart sync (or reuses an already-fresh one via a cart-contents fingerprint).
   - Runs a **price-parity guard**: compares Shopify's own `cart.cost.totalAmount` against Jawhara's own server-computed total (`/api/cart/totals`) within ~1 öre. On any mismatch, an inapplicable discount code, or a missing `checkoutUrl`, it refuses to navigate and shows a Swedish error — it never sends a customer to a wrong price.
   - On success: `trackInitiateCheckout(...)` fires, then `window.location.href = shopifyData.checkoutUrl` — a hard, full-page navigation off the Next.js app entirely, onto `jawharastore.se`.
4. **No Jawhara code runs during payment.** There is no iframe, no postMessage bridge, no shared session with the checkout domain.
5. Shopify confirms the order server-side and fires a webhook back to `jawhara.se`/`www.jawhara.se` (§3). This is the **only** channel of information flow back from the checkout domain to this app.

### 2.2 What this means for tracking specifically

- **No cookies, no `_fbp`/`_fbc`, no page state survive the domain hop.** Facebook's own `_fbp` cookie is scoped to `jawhara.se`; it is never read, forwarded, or re-set on `jawharastore.se`. The Shopify checkout domain is a completely separate origin with its own (if any) Meta Pixel configuration — **this repo has no visibility into or control over what, if anything, fires on the Shopify checkout domain itself.**
- **Confirmed: this Shopify store has no "Facebook & Instagram" sales channel installed** (stated directly in `lib/marketing/capi-purchase.ts`'s own comment, verified against the real store) — so nothing on the Shopify side is independently reporting this same purchase to Meta. If a sales channel like that were ever installed on the Shopify store, it could start double-reporting purchases with no deduplication against this app's CAPI call (different event IDs, different systems) — worth checking before porting this architecture to a store that *does* have one installed.
- **The price-parity guard (§2.1 step 3) is incidentally also the thing that keeps InitiateCheckout honest** — it only fires once Shopify has actually agreed to the price Jawhara is about to send the customer to pay, so an InitiateCheckout event always corresponds to a checkout that was actually reachable (not a dead link).
- **Attribution data has nowhere to travel.** Since the browser never returns to a Jawhara page after redirecting to checkout, any `fbclid`/`_fbp`/`_fbc` captured on `jawhara.se` would need to be threaded through to the eventual Shopify order (e.g., via Shopify cart attributes/note attributes passed at `cartCreate` time) for the server-side CAPI call to use later. **This is not done anywhere in this codebase** — see §4 for the exact gap.

---

## 3. Purchase Tracking — Webhooks, Order Sync, CAPI, Event IDs, Deduplication

### 3.1 Shopify webhooks — the real-time path

`scripts/shopify/register-webhooks.ts` registers 7 topics against the Admin GraphQL API, all pointed at `https://www.jawhara.se/api/webhooks/shopify` — **the `www` subdomain specifically**, because the apex `jawhara.se` 308-redirects to `www`, and Shopify's webhook delivery does not follow redirects (confirmed empirically, per the script's own comment: real paid orders never arrived until all subscriptions were repointed):

```
ORDERS_CREATE, ORDERS_PAID, ORDERS_UPDATED, ORDERS_CANCELLED,
FULFILLMENTS_CREATE, FULFILLMENTS_UPDATE, REFUNDS_CREATE
```

### 3.2 Signature verification + idempotency (`app/api/webhooks/shopify/route.ts`, full handler)

```ts
export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // signature verification needs the exact raw bytes
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookSignature(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "unknown";
  const webhookId = req.headers.get("x-shopify-webhook-id");
  if (!webhookId) return NextResponse.json({ error: "Missing webhook id" }, { status: 400 });

  // Idempotency: insert the delivery id first. A unique-constraint conflict means Shopify
  // already delivered (or is retrying) this exact attempt.
  const { error: dedupeError } = await supabaseService.from("shopify_webhook_events").insert({ shopify_webhook_id: webhookId, topic });
  if (dedupeError) return NextResponse.json({ received: true, deduped: true });

  // ... reconstructs the GraphQL GID from the REST order id and re-fetches the order fresh
  const result = await syncSingleShopifyOrder(orderGid);
  if (result.isNewlyPaid) await reportNewlyPaidPurchase(result.orderId);   // <-- the ONLY Purchase trigger
  if (result.isNewlyCancelled) await maybeSendCancellationEmail(result.orderId);
  return NextResponse.json({ received: true });
  // on any throw: delete the dedupe row so a genuine Shopify retry can reprocess, log to
  // integration_errors, return 500
}
```

`lib/shopify/webhook-verify.ts`'s `verifyShopifyWebhookSignature()` — HMAC-SHA256 over the raw body, keyed by `SHOPIFY_CLIENT_SECRET` (the same secret used for the Admin API OAuth client-credentials grant — Shopify signs custom-app webhooks with this), compared with `timingSafeEqual`.

**Deliberately never trusts the webhook's own JSON payload as data** — it only reads `payload.id`/`payload.order_id` to know *which* order to re-fetch, then calls `syncSingleShopifyOrder()`, which re-queries the full order fresh via Admin GraphQL. Reasoning (from the code's own comment): webhook deliveries are REST-shaped (plain numeric ids) and can arrive out of order or be retried after state has moved on — re-fetching guarantees acting on current truth.

### 3.3 The CAPI call itself (`lib/marketing/capi-purchase.ts`, reproduced in full)

```ts
export async function reportPurchaseToMeta(orderId: string, source: PurchaseReportSource = "webhook"): Promise<CapiPurchaseResult> {
  const { data: order } = await supabaseService
    .from("orders")
    .select("id, shopify_id, order_number, financial_status, total_price, currency_code, email, phone, is_test_order, processed_at")
    .eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.financial_status?.toUpperCase() !== "PAID") return { ok: false, error: `Order is not paid...` };
  if (order.is_test_order) return { ok: true, skipped: "Shopify test order - not reported to Meta" };

  const settings = await getMarketingSettings();
  if (!settings.metaPixelId || !settings.metaCapiAccessToken) return { ok: true, skipped: "Meta CAPI not configured" };

  // Atomic claim -- whoever gets here first for this order is the only one that ever reports it.
  const { data: claimed } = await supabaseService
    .from("orders").update({ purchase_event_sent_at: new Date().toISOString() })
    .eq("id", orderId).is("purchase_event_sent_at", null).select("id").maybeSingle();
  if (!claimed) return { ok: true, skipped: "Already reported" };

  let logRowId: string | null = null;
  try {
    const { data: logRow } = await supabaseService.from("purchase_tracking_log")
      .insert({ order_id: orderId, source, payment_confirmed_at: order.processed_at, detected_at: new Date().toISOString() })
      .select("id").single();
    logRowId = logRow?.id ?? null;

    const { data: items } = await supabaseService.from("order_items")
      .select("variant_id, quantity, unit_price, discounted_unit_price").eq("order_id", orderId);
    const contents = (items ?? []).filter((i) => i.variant_id).map((i) => ({
      id: i.variant_id as string, quantity: i.quantity, item_price: Number(i.discounted_unit_price ?? i.unit_price),
    }));

    const userData: Record<string, string[]> = {};
    if (order.email) userData.em = [sha256(order.email)];
    if (order.phone) userData.ph = [sha256(order.phone.replace(/[^\d+]/g, ""))];

    const eventId = `shopify_order_${order.shopify_id ?? order.id}`;
    const payload = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: order.currency_code, value: Number(order.total_price),
          content_name: order.order_number, content_type: "product", contents,
          num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
        },
      }],
    };

    const url = `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(settings.metaCapiAccessToken)}`;
    const outcome = await postToMetaWithRetry(url, payload);
    if (outcome.ok) { /* mark purchase_tracking_log accepted */ return { ok: true }; }

    // Release the claim so a genuine retry can try again instead of being permanently "sent".
    await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
    return { ok: false, error: outcome.error };
  } catch (err) {
    await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
    return { ok: false, error: `Unexpected error reporting purchase: ${(err as Error).message}` };
  }
}
```

**API endpoint**: `https://graph.facebook.com/v21.0/{metaPixelId}/events?access_token={token}` — plain Graph API, no Business SDK dependency.

**Values re-derived from the database, never trusted from any caller**: email/phone/amount/currency/order number/line items are all re-read from `orders`/`order_items` by `orderId` — the function signature only ever takes an internal order UUID, never amount/currency/etc. as parameters.

### 3.4 Event ID & deduplication

`eventId = \`shopify_order_${order.shopify_id ?? order.id}\`` — one event ID per order, used as Meta's `event_id` field. Since there is no browser-side Purchase event for a real sale (§1.2/§2.2), there is currently nothing to deduplicate *against* in production — but the ID scheme is deliberately kept dedupe-ready. The code comment states this explicitly: *"If a browser-side Purchase is ever added back (e.g. via a Shopify checkout web pixel extension), give it the SAME event_id this sends (`shopify_order_<order id>`) so Meta can dedupe the two."*

**Historical note**: this event-ID scheme replaced an earlier Stripe-session-ID-based one when checkout moved off Stripe (the Stripe-era `trackPurchase` call in `kassa/bekraftelse/page.tsx` still passes a Stripe session ID as its `eventId` — that's correct for its own dead-code context, just no longer meaningful for real sales).

### 3.5 Order sync — the shared upsert function (`lib/shopify/order-sync-shared.ts`)

`upsertShopifyOrder()` is the **one function** used by both this real-time webhook path and the periodic reconciliation sweep (§5) — they can never disagree about how a Shopify order maps to the schema. Key excerpt (full file is ~320 lines, reproduced where most relevant):

```ts
export type UpsertOrderResult = {
  orderId: string;
  isNewlyPaid: boolean;
  isNewlyCancelled: boolean;
  newFulfillmentIds: string[];
  newRefundIds: string[];
};

export async function upsertShopifyOrder(o: ShopifyOrderNode): Promise<UpsertOrderResult> {
  const sid = idTail(o.id)!;
  const { data: existing } = await supabaseService.from("orders").select("id, financial_status, cancelled_at").eq("shopify_id", sid).maybeSingle();

  // ... upserts orders/order_items/payments/fulfillments/refunds by shopify_id, matching line
  // items to Jawhara's own catalog via CURRENT shopify_product_id/shopify_variant_id GID columns
  // -- never the legacy `shopify_id` column, which is stale from this store's original export.

  const isNewlyPaid = o.displayFinancialStatus === "PAID" && existing?.financial_status !== "PAID";
  const isNewlyCancelled = !!o.cancelledAt && !existing?.cancelled_at;
  return { orderId, isNewlyPaid, isNewlyCancelled, newFulfillmentIds, newRefundIds };
}
```

`isNewlyPaid`/`isNewlyCancelled` are **computed by comparing the just-fetched state against what was already in Supabase before this upsert** — this is the exact mechanism that prevents re-reporting Meta Purchase on every webhook redelivery for an already-paid order (a redelivered `ORDERS_UPDATED` for an order already marked `PAID` computes `isNewlyPaid = false`), independent of and in addition to the `purchase_event_sent_at` atomic claim in §3.3.

The `ORDER_FIELDS_FRAGMENT` GraphQL fragment this module shares includes `test` (Shopify's own test-order boolean, synced straight to `orders.is_test_order` — §3.6) and the full `transactions`/`fulfillments`/`refunds` sub-objects used to populate `payments`/`fulfillments`/`refunds`.

### 3.6 Test-order exclusion

`orders.is_test_order` (migration `0043_order_is_test_flag.sql`):
```sql
alter table orders add column if not exists is_test_order boolean not null default false;
```
Populated directly from Shopify's `test` field on every order sync (`order-sync-shared.ts:159`, `is_test_order: o.test`). Checked unconditionally and first in `reportPurchaseToMeta()` (§3.3) — before even checking whether Meta is configured — so a test order placed via Shopify's "Place test order" admin action or `test: true` on the Admin API orderCreate mutation can never contaminate real ad reporting/optimization.

**Live-verified** (2026-10-29, direct Supabase query): of 384 real paid Shopify-sourced orders, exactly 1 is flagged `is_test_order = true`, and that order's `purchase_event_sent_at` is confirmed `null` — the guard has never reported it.

---

## 4. Attribution — `_fbp`, `_fbc`, `fbclid`, Customer Matching Data

**Confirmed via repository-wide `grep -rn "fbp\|fbc\b\|fbclid\|_fbp\|_fbc"` across every `.ts`/`.tsx` file: zero matches, anywhere.** This is a real, complete gap, not an oversight hidden somewhere else in the code.

### 4.1 What IS sent (`user_data` in the CAPI payload, §3.3)

```ts
const userData: Record<string, string[]> = {};
if (order.email) userData.em = [sha256(order.email)];
if (order.phone) userData.ph = [sha256(order.phone.replace(/[^\d+]/g, ""))];
```
`sha256()` (same file): `createHash("sha256").update(value.trim().toLowerCase()).digest("hex")` — lowercased/trimmed before hashing, matching Meta's documented normalization requirement for `em`/`ph`.

### 4.2 What is NOT sent — confirmed, complete list

- **No `fbp`/`fbc`** (Meta's own first-party click/browser-id cookies) — never read from `document.cookie`, never forwarded anywhere, never present in any CAPI payload field.
- **No `client_ip_address`/`client_user_agent`** — the CAPI payload has no such fields; the webhook handler never captures the customer's IP/UA at any point (it couldn't anyway — by the time the webhook fires, the request is from Shopify's servers, not the customer's browser).
- **No `fbclid` capture** — no code anywhere reads a `fbclid` query parameter off incoming traffic.
- **No `external_id`** (a hashed customer ID) in `user_data` — only `em`/`ph`.

### 4.3 Why this matters, and what it would take to fix

Meta's CAPI "Event Match Quality" score depends heavily on `fbp`/`fbc`/IP/UA — without them, match quality (and therefore ad optimization/attribution accuracy) is meaningfully worse than it could be, even though the events themselves are delivered successfully (confirmed delivered — §9).

**Why it's architecturally hard here specifically** (§2.2): the browser that has `_fbp`/`fbclid` is on `jawhara.se`, but the order is confirmed on a completely separate domain (`jawharastore.se`) and the webhook that triggers CAPI runs entirely server-side, with no access to the original browser session at all. Closing this gap for real would require:
1. Capturing `_fbp`/`fbclid` client-side on `jawhara.se` (a cookie read, straightforward).
2. Threading it through to the Shopify order somehow — most plausibly via Shopify cart attributes (`cartCreate`'s `attributes` field, not currently sent at all — `lib/shopify/storefront.ts`'s `cartCreate` only sends `lines`) or note attributes, so it survives into the order Shopify creates.
3. Reading it back out of the order data in `upsertShopifyOrder()`/`reportPurchaseToMeta()` and adding it to `user_data.fbp`/`user_data.fbc`.

**None of this exists today.** If Amarenti's checkout has the same cross-domain architecture, budget real engineering time for this if match quality matters — it is not a quick addition.

---

## 5. Recovery System — Retries, Cron Jobs, Database Safeguards

### 5.1 The atomic idempotency claim (already shown in §3.3)

```ts
const { data: claimed } = await supabaseService
  .from("orders").update({ purchase_event_sent_at: new Date().toISOString() })
  .eq("id", orderId).is("purchase_event_sent_at", null).select("id").maybeSingle();
if (!claimed) return { ok: true, skipped: "Already reported" };
```
A plain conditional `UPDATE ... WHERE purchase_event_sent_at IS NULL`. Whichever caller's query actually updates a row (`claimed` is non-null) is the only one that proceeds to call Meta. This is what lets three independent callers (webhook, GitHub Actions, pg_cron — §5.3) safely race against each other with no coordination.

### 5.2 Retries with backoff (`lib/marketing/capi-purchase.ts`)

```ts
async function postToMetaWithRetry(url: string, payload: unknown, maxAttempts = 3): Promise<MetaCallOutcome> {
  let lastError: MetaCallOutcome = { ok: false, error: "Not attempted", retryable: true };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (res.ok) return { ok: true };
      const retryable = res.status >= 500; // a 4xx (bad token, malformed event) won't succeed on retry
      lastError = { ok: false, error: data?.error?.message ?? `Meta CAPI request failed (${res.status})`, retryable };
      if (!retryable) return lastError;
    } catch (err) {
      lastError = { ok: false, error: `Network error calling Meta CAPI: ${(err as Error).message}`, retryable: true };
    }
    if (attempt < maxAttempts) await sleep(attempt * 500); // 500ms, 1000ms
  }
  return lastError;
}
```
Up to 3 attempts, only on 5xx/network errors — a 4xx (bad access token, malformed payload) is treated as permanent within this process and fails fast rather than burning retries on something retrying can't fix.

### 5.3 Three independent schedulers hitting the same reconciliation route

`app/api/cron/sync-orders/route.ts`:
```ts
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const source =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ? "cron_sync"
    : authHeader === `Bearer ${process.env.EXTERNAL_CRON_SECRET}` ? "github_actions"
    : authHeader === `Bearer ${process.env.SUPABASE_CRON_SECRET}` ? "pg_cron"
    : null;
  if (!source) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncOrdersFromShopify(source);
  await supabaseService.from("cron_sync_runs").insert({ source, pulled_count: result.pulledCount, imported_count: result.importedCount, error_count: result.errors.length });
  if (result.errors.length) await logIntegrationError("cron_sync", result.errors.join("; "), { source, pulledCount: result.pulledCount });
  return NextResponse.json(result);
}
```

| Scheduler | Config | Real status, confirmed |
|---|---|---|
| Vercel Cron, once daily | `vercel.json`: `{"crons":[{"path":"/api/cron/sync-orders","schedule":"0 3 * * *"}]}`, secret `CRON_SECRET` (Vercel attaches automatically) | Live, slow backstop only |
| GitHub Actions | `.github/workflows/sync-orders-recovery.yml`, secret `EXTERNAL_CRON_SECRET` | **Manual-only today** (`on: workflow_dispatch: {}` — the automatic `schedule:` trigger was deliberately removed; the workflow's own comment explains why: *"this workflow's own scheduled runs ended up roughly 2+ hours apart despite a 5-minute cron expression, while pg_cron fires within a second of every scheduled tick"*). **Live-verified**: 3 of 16 real `purchase_tracking_log` rows are tagged `source: "github_actions"` — someone (or an earlier version of the schedule) genuinely triggered it and it caught real missed purchases. |
| Supabase `pg_cron` (+ `pg_net`), every 5 minutes, inside Supabase's own Postgres | Secret `SUPABASE_CRON_SECRET` | **Live-verified, currently the real automatic 5-minute path** — 20 most-recent `cron_sync_runs` rows queried directly are *all* tagged `source: "pg_cron"`, confirming it fires regularly right now. **⚠️ Not defined anywhere in this git repository** — no migration or script contains the `cron.schedule(...)` SQL; it was set up once, directly in the live Supabase SQL editor, and only exists there. Reproducing this for Amarenti means writing and running that `cron.schedule(...)` call yourself; it cannot be copied from this repo. |

`syncOrdersFromShopify(recoverySource?)` (`lib/shopify/sync-orders.ts`) — pulls recent orders, upserts each via the same `upsertShopifyOrder()`, and when called with a `recoverySource`, applies a **3-day recovery window** (`RECOVERY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000`) — only orders processed within that window get the same `reportNewlyPaidPurchase`/cancellation-email side effects a webhook would have triggered, bounding the sweep to genuinely-recent events rather than ever touching the historical backfill.

### 5.4 Database safeguards

- `orders.purchase_event_sent_at` (nullable timestamptz) — the atomic claim column (§5.1), migration `0042_meta_capi_purchase_tracking.sql`.
- `purchase_tracking_log` (migration `0045`) — one row per *attempt*, not per order, spanning `payment_confirmed_at → detected_at → capi_submitted_at → capi_accepted_at`/`capi_error`, tagged by `source`. **Live-verified**: 16 real rows, 13 via `webhook`, 3 via `github_actions`, **100% with `capi_accepted_at` set, 0 with `capi_error`** — every real Purchase report this app has ever attempted has succeeded.
- `shopify_webhook_events` (migration `0041`) — raw webhook-delivery dedup (§3.2), separate from a pre-existing Stripe-only `webhook_events` table that has a `NOT NULL stripe_event_id` and isn't reusable here.
- `integration_errors` (migration `0044`) — durable error log (`lib/monitoring/log-integration-error.ts`'s `logIntegrationError(source, message, context?, orderId?)`), since Vercel function logs aren't conveniently queryable by this project's operators. Called from the webhook's catch block and from `sync-side-effects.ts`'s CAPI-failure branch.
- `cron_sync_runs` (migrations `0044`+`0046` for the `source` column) — one row per reconciliation sweep, with pulled/imported/error counts, so an underperforming scheduler is visible per-source rather than only in aggregate.

### 5.5 The bug this whole retry/claim-release design exists to prevent (§6 covers this as a fix, referenced here because it's load-bearing for "how recovery works")

The claim in §5.1 is **released** on any failure, not just a Meta API error:
```ts
} catch (err) {
  await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
  ...
}
```
Without this, a transient failure *between* claiming and actually calling Meta (e.g. a flaky Supabase read for the order items) would leave an order permanently marked "sent" with no event ever delivered — and the real-time webhook can never retry it (`isNewlyPaid` is only true once per order's lifetime), so only a reconciliation sweep picking it back up via `recoverySource` could ever recover it, and only because the claim was released.

---

## 6. All Previous Fixes — What Broke, and How It Was Actually Solved

In chronological order, each grounded in a real commit hash on the actual production branch (verified ancestor of `HEAD` via `git merge-base --is-ancestor`).

1. **`ee86b6f` — Initial build.** "Add marketing & analytics integrations: Meta Pixel, Conversions API, GA4, product feed." Built the consent gate, the four client events, the original server-side CAPI route, the product feed, and the admin settings page. Commit message states explicitly: *"No real Pixel ID, CAPI token, or GA4 ID is configured yet -- every integration stays inactive until provided."*

2. **`fa067f0` — "WIP: server-side Meta CAPI Purchase tracking + SPA PageView fix."** Two real problems solved in one commit:
   - **The actual `reportPurchaseToMeta()` function was built here**, wired into the webhook's `isNewlyPaid` branch (this was the move from Stripe-triggered to Shopify-webhook-triggered CAPI, following the broader checkout migration off Stripe).
   - **The PageView-refire bug**: `fbq('track','PageView')` only fired once, from the Pixel's own inline init script, on the very first full page load. Next.js App Router client-side navigation (any `<Link>` click) never reloads the page, so **most real pageviews on the site were never being reported to Meta at all.** Fixed by adding a `usePathname()`-keyed effect in `cookie-consent-and-tracking.tsx` that calls `trackPageView()` on every route change (skipping its own first run, since the inline script already covers that one).
   - Shipped with a deliberate, temporary, self-limiting verification endpoint (`app/api/internal/test-meta-capi`) specifically because the dev sandbox this work was done in can't reach `graph.facebook.com` directly — needed a real deployment to confirm the Graph API call actually worked.

3. **`1d4a33b` — "Remove temporary Meta CAPI verification endpoint."** Closed the loop on #2: created a synthetic test order (`order_number LIKE 'META-CAPI-TEST-%'`, no real customer, no email sent), confirmed the endpoint refused anything not named like it, called `reportPurchaseToMeta()` against it from the real deployment, confirmed Meta accepted the event and a second call correctly returned "Already reported" (proving the idempotency claim worked end-to-end against the real API, not just in theory) — then deleted the test order/endpoint entirely.

4. **`3b60b25` — "Never report Shopify test orders to Meta CAPI as real purchases."** Added `orders.is_test_order` (migration `0043`), synced from Shopify's own `test` field, checked unconditionally and first in `reportPurchaseToMeta()` — §3.6.

5. **`e12e69a` — "Add reconciliation safety net and durable error logging for Shopify sync."** Shopify's own docs state webhook delivery "isn't guaranteed" — added the daily Vercel Cron reconciliation sweep (independent of real-time webhooks and the manual admin sync button), and `integration_errors` so webhook/CAPI failures are queryable in Supabase instead of only visible in ephemeral Vercel logs.

6. **`8b99410` — "Make Shopify's native order confirmation and refund emails the system of record."** Not a Meta fix directly, but the commit that defined *which* events the CAPI/recovery system should actually react to (`isNewlyPaid`/`isNewlyCancelled`) and introduced the atomic-claim pattern for email sends that §5.1's purchase-tracking claim directly mirrors. Also blocked Jawhara admin from ever refunding a Shopify order locally (refunds must go through Shopify itself).

7. **`bc49a26` — "Add 5-minute recovery sweep, Meta CAPI retries, and end-to-end latency logging."** Three things in one commit: the GitHub Actions 5-minute sweep (since Vercel Hobby only supports once-daily native Cron), `postToMetaWithRetry()` (§5.2), and `purchase_tracking_log` (§5.4) so real end-to-end latency and *which path actually caught each order* became measurable after the fact.

8. **`49fe4dd` — "Prevent permanent Purchase-event suppression on unexpected errors."** The real bug: §5.1's claim was originally only released on a Meta-API-level failure. Any *other* exception between claiming and sending (a transient Supabase read, for instance) left an order **permanently** marked "sent" with no event ever delivered and no possible recovery, since the real-time webhook never re-processes an order once it's no longer newly-paid. Fixed by wrapping the entire post-claim path (§5.5) so any failure releases the claim.

9. **`5878f47` — "Fix admin panel performance and restore website analytics."** Not a Meta Pixel fix, but worth knowing: this is also where the separate first-party web-analytics system (distinct from Meta/GA4, logging to Jawhara's own `analytics_events`/`analytics_sessions` tables) was restored after being orphaned by the Shopify-checkout migration. `lib/marketing/events.ts`'s client functions each call `logAnalyticsEvent(...)` from this system in addition to `fbq`/`gtag` — worth noting since it lives in the exact same file as the Meta Pixel wrappers and could be confused for part of the Meta integration; it is not Meta-related at all, just colocated.

### 6.1 Real work that exists but is **NOT** in this production branch — do not copy as "current behavior"

Confirmed via `git merge-base --is-ancestor <hash> HEAD` returning **false** for every one of these — they live on a sibling branch (`claude/determined-archimedes-dob6pv`) that was never merged into `claude/magical-babbage-ne4n82`:

- `6cdf386` "Support Meta test_event_code in server-side CAPI Purchase call" — the current `capi-purchase.ts` (§3.3, read directly from production) has **no** `test_event_code` parameter or support.
- `bff858f` "Prepare Meta Pixel integration: fix PageView dedup, add missing events" — superseded in production by `fa067f0`'s own, different PageView fix (§6 item 2).
- `1be4236`/`49c261e`/`240c6c8` — three commits fixing the product feed's Meta-catalog compatibility (content_ids matching, collection labels) — **the production product feed may still have whatever issues these were fixing.** Worth reading that sibling branch before assuming the feed is Meta-catalog-ready.

If reproducing this for Amarenti from scratch, these are worth reviewing as *candidate* features, but they were never battle-tested in Jawhara's own production — don't present them to Amarenti as proven.

---

## 7. Actual Code, Tables, Migrations — Quick Reference

| Concern | File |
|---|---|
| Consent | `lib/marketing/consent.ts` |
| Client Pixel/GA4 script injection + banner | `components/marketing/cookie-consent-and-tracking.tsx` |
| Client event wrappers | `lib/marketing/events.ts` |
| First-party analytics (separate system, colocated) | `lib/marketing/first-party-analytics.ts` |
| Server-side CAPI | `lib/marketing/capi-purchase.ts` |
| Admin settings read/write | `lib/admin/marketing-settings.ts`, `app/admin/(authenticated)/settings/marketing/{page,actions}.tsx`, `components/admin/marketing-settings-form.tsx` |
| Shopify webhook receiver | `app/api/webhooks/shopify/route.ts` |
| Webhook signature verification | `lib/shopify/webhook-verify.ts` |
| Webhook registration (one-time setup script) | `scripts/shopify/register-webhooks.ts` |
| Shared order upsert (webhook + reconciliation) | `lib/shopify/order-sync-shared.ts` |
| Side effects (CAPI + cancellation email) | `lib/shopify/sync-side-effects.ts` |
| Reconciliation sweep | `lib/shopify/sync-orders.ts`, `app/api/cron/sync-orders/route.ts` |
| Durable error logging | `lib/monitoring/log-integration-error.ts` |
| Shopify Storefront API client (cart sync) | `lib/shopify/storefront.ts`, `lib/shopify/cart-sync.ts` |
| Checkout redirect + price-parity guard | `components/cart/cart-provider.tsx` (`goToCheckout`), `components/cart/cart-drawer.tsx` (`handleCheckout`) |
| Dead-code Stripe-era confirmation page | `app/(storefront)/kassa/bekraftelse/page.tsx` |
| Dead-code compat route | `app/(storefront)/kassa/page.tsx` |

**Database tables**: `marketing_settings` (id, meta_pixel_id, meta_capi_access_token, ga4_measurement_id), `orders.purchase_event_sent_at` + `orders.is_test_order` (columns on the existing `orders` table), `purchase_tracking_log`, `shopify_webhook_events`, `integration_errors`, `cron_sync_runs`.

**Migrations** (apply in order, same numbering as the real repo):
```
0042_meta_capi_purchase_tracking.sql   -- orders.purchase_event_sent_at
0043_order_is_test_flag.sql            -- orders.is_test_order
0044_integration_monitoring.sql        -- integration_errors, cron_sync_runs
0045_purchase_tracking_log.sql         -- purchase_tracking_log
0046_cron_sync_runs_source.sql         -- cron_sync_runs.source
```
Full SQL for `0045` (the others are one or two `alter table`/`create table` lines, already quoted verbatim in §3.6/§5.4 above):
```sql
create table if not exists purchase_tracking_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  source text not null, -- 'webhook' | 'cron_sync' | 'github_actions'
  payment_confirmed_at timestamptz,
  detected_at timestamptz not null default now(),
  capi_submitted_at timestamptz,
  capi_accepted_at timestamptz,
  capi_error text,
  created_at timestamptz not null default now()
);
create index if not exists purchase_tracking_log_order_id_idx on purchase_tracking_log (order_id);
alter table purchase_tracking_log enable row level security;
create policy "admin only" on purchase_tracking_log for all using (is_admin()) with check (is_admin());
```

**⚠️ Not in any migration file — must be recreated manually in Amarenti's Supabase project**: the `pg_cron`/`pg_net` job itself (§5.3). Query the live Supabase `cron.job` table in Jawhara's own project (via the SQL editor) to get its exact schedule/call before trying to replicate it — it cannot be found in this git history.

---

## 8. Configuration — Environment Variables, Shopify Settings, Meta Settings (names only, no values)

### 8.1 Environment variables actually read by this code path

| Variable | Used by | Notes |
|---|---|---|
| `SHOPIFY_CLIENT_SECRET` | `lib/shopify/webhook-verify.ts` | Signs/verifies webhook HMAC — same secret as the Admin API OAuth client-credentials grant |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | `lib/shopify/storefront.ts` | Separate, Storefront-API-scoped token (not the Admin API client ID/secret pair) |
| `SHOPIFY_STOREFRONT_DOMAIN` (optional) / `SHOPIFY_STORE_DOMAIN` | `lib/shopify/storefront.ts` | Falls back to the latter if the former is unset |
| `CRON_SECRET` | `app/api/cron/sync-orders/route.ts` | Vercel attaches this automatically to its own native Cron requests — no manual value needed |
| `EXTERNAL_CRON_SECRET` | same | Bearer token the (now manual-only) GitHub Actions workflow sends |
| `SUPABASE_CRON_SECRET` | same | Bearer token the Supabase-internal `pg_cron` job sends |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | throughout | Standard Supabase access, not Meta-specific |

**No Meta-specific environment variable exists** — Pixel ID, CAPI access token, GA4 ID are all `marketing_settings` table values, editable only via the admin UI.

### 8.2 Shopify-side settings required

- A custom (non-public) Shopify app with:
  - Admin API access (OAuth client-credentials grant) — scopes covering orders/fulfillments/refunds read, used both for the webhook's `syncSingleShopifyOrder()` and the reconciliation sweep's bulk order pull.
  - A **separate** Storefront API access token, scoped for cart creation/management (`unauthenticated_write_checkouts` and friends).
- 7 webhook subscriptions registered against `https://<your-domain-www>/api/webhooks/shopify` for `ORDERS_CREATE`, `ORDERS_PAID`, `ORDERS_UPDATED`, `ORDERS_CANCELLED`, `FULFILLMENTS_CREATE`, `FULFILLMENTS_UPDATE`, `REFUNDS_CREATE` — **must be the non-apex/non-redirecting hostname**, confirmed critical by Jawhara's own real incident (§6 doesn't list this specific one, but it's covered by the `register-webhooks.ts` comment quoted in §3.1).
- No Shopify "Facebook & Instagram" sales channel installed (confirmed for Jawhara) — if Amarenti's Shopify store *does* have one, check for double-reporting before assuming this architecture transfers cleanly (§2.2).

### 8.3 Meta-side settings required

- A Meta Pixel ID and a Conversions API access token (minted from Meta Events Manager), entered via `/admin/settings/marketing` — not an env var.
- No Meta product catalog/Commerce Manager setup is described or required by this document — the product feed at `/feed/products.xml` exists independently and is out of scope here per the Jawhara project's own prior instruction not to configure a Meta catalog.

---

## 9. Verification — What's Confirmed Working, What's Tested, What's Limited

### 9.1 Confirmed working (live-verified against the production Supabase database, 2026-10-29)

- **Meta Pixel ID and CAPI access token are both currently configured** in `marketing_settings` (confirmed non-empty; values not read or disclosed). GA4 is **not** configured (empty).
- **16 real Purchase-reporting attempts exist in `purchase_tracking_log`**, 13 via the real-time webhook, 3 via the (now manual-only) GitHub Actions sweep — **100% have `capi_accepted_at` set, 0 have `capi_error`.** Every attempt this system has ever made has succeeded.
- **The test-order guard is confirmed working on a real order**: the one real order flagged `is_test_order = true` has `purchase_event_sent_at` confirmed `null` — it was never reported.
- **`pg_cron` is confirmed actually running right now** — the 20 most recent `cron_sync_runs` rows are all tagged `source: "pg_cron"`, meaning the 5-minute Supabase-internal scheduler is live and firing on schedule, exactly as the code's own comments claim.
- **The idempotency claim, the HMAC signature check, and the webhook dedup table are all exercised in real production traffic** — not just unit-level logic.

### 9.2 Confirmed by direct code reading, not yet exercised by real data

- The retry-with-backoff path (`postToMetaWithRetry`, up to 3 attempts) has never needed to retry in production so far (0 errors logged) — its *logic* is correct by inspection, but it has not been observed actually retrying a real 5xx from Meta.
- The claim-release-on-any-failure fix (§5.5/§6 item 8) has no observed real-world trigger either — confirmed present in the code, not confirmed to have ever actually fired and recovered a stuck order.

### 9.3 Confirmed limitations (do not silently fix when porting — these are real, present-day gaps)

1. **No `_fbp`/`_fbc`/`fbclid`/IP/UA capture anywhere** (§4) — confirmed by exhaustive grep, not a partial implementation.
2. **No browser-side Purchase event for a real sale** — the only Purchase signal is the server-side CAPI call; `trackPurchase()` exists in code but its only reachable call site is dead for the real customer flow (§1.2).
3. **The admin UI's "saved encrypted" claim about the CAPI token is false** (§1.4) — plaintext column, RLS-protected only.
4. **The `pg_cron` job that's actually doing the real recovery work is not in git anywhere** (§5.3/§7) — a real, confirmed infrastructure-drift gap, not a documentation oversight.
5. **GitHub Actions' automatic 5-minute schedule was deliberately removed** — only `workflow_dispatch` (manual) remains; don't assume it's firing on its own.
6. **No historical backfill** — 384 total paid Shopify orders exist, only 15 have ever been reported to Meta (the other 369 predate Meta being configured on this store and were never retroactively reported; no backfill mechanism exists in this codebase).
7. **Real, unmerged work exists on another branch** (§6.1) that touches `test_event_code` support and Meta product-feed compatibility — don't assume it's part of what's described above; it isn't live in Jawhara production.
8. **No visibility into whatever Meta Pixel configuration, if any, exists on the separate Shopify checkout domain itself** — this document only covers what `jawhara.se`'s own code controls.

---

*Document generated by direct reading of the real production branch (`claude/magical-babbage-ne4n82`, commit `92305b2`) plus live, read-only queries against the production Supabase database. No application code, Shopify configuration, Supabase schema, or Meta settings were modified. No secrets are included anywhere — only environment variable names, table/column names, and confirmation of whether (not what) certain values are configured.*
