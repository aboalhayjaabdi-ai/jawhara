# Jawhara — Technical Handover Document (v2 — updated for the real production branch)

**Purpose:** This document is written so a *new* Claude session, with zero access to the conversation history that built this project, can understand the existing Jawhara codebase well enough to reuse its proven backend/admin architecture while building a **new, independent luxury-handbag storefront** (new frontend, new Shopify data source, new payment/checkout setup, new Meta Pixel).

**Scope of this document:** 100% read-only research. No application code was modified and nothing was deployed while writing it. No secrets are included anywhere below — only environment variable *names* and table/column names.

**Branch provenance — read this before anything else.** An earlier version of this document was written against `claude/festive-pasteur-77mezq` and committed there. That branch is **not** the real production branch — it diverged from the real production line right after one shared commit (`e596926`, the pagination-UI change) and never received 25 subsequent commits that did land on `claude/magical-babbage-ne4n82`, which the project owner confirmed is the actual deployed branch. Those 25 commits are not a minor update: **they pivot the entire checkout architecture from Stripe to Shopify's own hosted checkout.** This document is a full rewrite against `claude/magical-babbage-ne4n82`, published on a new branch, `claude/jawhara-handover-update`, created from that branch's tip and containing no other changes. If anything in the old (`festive-pasteur-77mezq`-era) version of this document is still floating around, **discard it** — large parts of its §0/§2/§3 are now factually wrong for the real system.

**A second, important provenance note.** This repository contains several other `claude/*` branches besides the two above. Most are fully absorbed into `magical-babbage-ne4n82` already, but two are not and contain real, apparently-unmerged work relevant to a new engineer:
- **`claude/epic-gates-zdrpdn`** — contains `scripts/shopify/migrate-collections.ts`, `migrate-products.ts`, and `untrack-inventory.ts`: idempotent scripts that push the *current* Supabase catalog into a **brand-new Shopify store** (matched by handle, deriving Shopify option names from the raw `option1`/`option2`/`option3` values since Supabase stores no axis-name field). This is directly relevant to the "new store" project this handover exists for — review that branch's 3 commits before writing new migration tooling from scratch.
- **`claude/determined-archimedes-dob6pv`** — contains real, apparently-never-merged features not present on `magical-babbage-ne4n82`: automated review-request emails + customer review submission, product-feed fixes for Meta's catalog/content_ids matching, Meta Pixel PageView-dedup prep work, and a "3 för 2" badge on product cards/pages. (Its website-analytics-section commit *was* separately re-built and merged into `magical-babbage-ne4n82` — see §6 below — but the rest of this branch's work was not.)

Neither of these was merged into this document's branch, per the explicit instruction not to merge anything into production. They're named here so the next engineer doesn't lose track of real, valuable work sitting on an unmerged branch.

**How this document was produced:** Three parallel, read-only research passes over the actual `magical-babbage-ne4n82` code (checkout/Shopify-cart/discount-sync architecture; order/fulfillment two-way sync and scheduling infrastructure; the Meta CAPI rework and contact form), plus direct verification reads of every new migration file, the cron route, the GitHub Actions workflow, and `vercel.json`. Sections carried over unchanged from the original research (admin dashboard CRUD, baseline database schema, product/catalog fundamentals, image pipeline, deployment reproduction steps) were spot-checked against this branch and are still accurate — they are reused below rather than re-derived from scratch.

---

## 0. Read This First — Checkout Has Flipped: Shopify Is Now Live, Stripe Is Not

The previous version of this document's §0 corrected an assumption that checkout was Shopify-based, explaining that it was actually 100% Stripe. **That is now backwards.** On `magical-babbage-ne4n82`:

- **Live customer checkout is a real Shopify Storefront API cart, redirected to Shopify's own hosted checkout page**, on a separate domain (`jawharastore.se`, confirmed in code comments — this is a distinct domain from `jawhara.se`/`www.jawhara.se`, which still serve the Next.js storefront).
- **Stripe is not fully removed, but it is no longer part of any customer-facing flow.** It survives as a secondary rail used *only* by the admin dashboard's manual/draft-order creation feature (an admin can still generate a Stripe Checkout Session for an order they create by hand in the admin). The old storefront checkout route (`app/api/checkout/route.ts`) is **confirmed deleted**. The old `/kassa` page still exists as a file but now does nothing except run the same cart-sync-and-redirect logic and bounce to Shopify (or home, on failure) — it renders no checkout UI of its own anymore.
- **Jawhara's own discount engine (`lib/discounts.ts`) still exists and is still queried** — but only to show a price preview in Jawhara's own cart UI and to run a "price parity" sanity check right before redirecting to Shopify. **The actual charge and the actual discount application happen inside Shopify's own checkout**, using **native Shopify discounts** that an admin-side sync process (`lib/shopify/discount-sync.ts`) pushes up from Jawhara's admin-configured discounts.
- Order confirmation emails and refund emails are **no longer sent by this app at all** for real storefront sales — Shopify's own native transactional emails are the explicit, deliberate system of record for those two events. Resend is still used, but only for: shipping-confirmation emails (with real purchased-variant images Shopify's own email can't show), order-cancellation emails, and (new, see §6) contact-form submissions.

If you take nothing else from this section: **do not assume Stripe is the payment rail for this project anymore.** It's real estate for historical/admin-manual orders only. The rest of this document explains the real, current architecture in detail.

---

## 1. Complete Architecture

### 1.1 Tech stack

Unchanged from the original research at the framework/library level — still Next.js 15 (App Router) / React 19 / TypeScript, Supabase (Postgres + Auth + Storage), Resend for email, deployed on Vercel. What changed is *what calls what*:

- `stripe` / `@stripe/stripe-js` / `@stripe/react-stripe-js` remain real `package.json` dependencies — confirmed still required, because the admin manual-order Stripe-link path, the admin payments/settings page, and historical order refund handling all still use them. Do not remove these thinking they're dead weight; they're a smaller but still-live rail.
- No Shopify Storefront API client library is installed as a dependency — `lib/shopify/storefront.ts` is a **hand-written GraphQL client** (plain `fetch`, not a Shopify SDK) that talks to the Storefront API directly.

### 1.2 Env vars — what's new since the Stripe-only era

In addition to the original list (Supabase, Stripe, Resend, Shopify Admin API client credentials, 17TRACK), the live system now also needs:

- `SHOPIFY_STOREFRONT_ACCESS_TOKEN` — a **separate, Storefront-API-scoped** token, not the Admin API `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` pair. Created in Shopify Admin under Develop apps → API credentials → Storefront API, with scopes `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`, `unauthenticated_write_checkouts`.
- `SHOPIFY_STOREFRONT_DOMAIN` (optional — defaults to `SHOPIFY_STORE_DOMAIN` if unset).
- `CRON_SECRET` — Vercel attaches this automatically to its own Vercel Cron requests (see §4.3); no manual value needed, Vercel sets it.
- `EXTERNAL_CRON_SECRET` — the bearer token the (now-manual-only) GitHub Actions workflow sends.
- `SUPABASE_CRON_SECRET` — the bearer token the Supabase-internal `pg_cron` job sends. **Important**: the `pg_cron` job itself is not defined anywhere in this git repository (see §4.3 and §10) — only the secret it's expected to send is referenced in code.

No new Meta/CAPI-specific env var was added — Meta Pixel ID/CAPI access token are still DB-configured via `marketing_settings`, unchanged from the original research.

### 1.3 Everything else in §1 of the original research

The image pipeline (`lib/image-loader.ts`, pre-generated WebP tiers bypassing Vercel's Image Optimization), the dev-sandbox-only outbound proxy quirk, and the route structure under `app/` are all unchanged and still accurate as originally documented. Not repeated here for length; see Appendix A for file paths.

---

## 2. Checkout — Shopify Storefront Cart + Hosted Checkout (the real current implementation)

### 2.1 The cart stays the same; a background process mirrors it to Shopify

`components/cart/cart-provider.tsx` keeps the exact same `localStorage`-persisted `CartItem[]` model and the same `addItem`/`removeItem`/`setQty` API as before — nothing about how the visible Jawhara cart behaves changed structurally. What's new: every cart or discount-code change now debounces (500ms) and calls `syncWithShopify()`, which `POST`s to `/api/shopify-cart/sync` (`app/api/shopify-cart/sync/route.ts`) → `syncShopifyCart()` in `lib/shopify/cart-sync.ts`. Every call is serialized through a `syncQueueRef` promise chain (`cart-provider.tsx`) — a deliberate fix for a real concurrency bug (see §2.5).

### 2.2 Resolving the cart into real Shopify line items

`resolveDesiredLines()` (`lib/shopify/cart-sync.ts`) re-derives real availability from Supabase using the same `isVariantAvailable()` function used everywhere else in the app, maps each `variantId` to `product_variants.shopify_variant_id` — a column holding the variant's **current, live Shopify GID** — and clamps quantity to real stock, dropping anything that can't map with a Swedish warning. **This is deliberately not the legacy `shopify_id` column** (the one carrying IDs from the original historical Shopify export) — that column is stale for any order placed after the catalog was regenerated on the new Shopify store. `shopify_variant_id`/`shopify_product_id` (on `product_variants`/`products` respectively) are the columns that matter for everything checkout-, discount-, and order-sync-related from here on.

**⚠️ Schema-drift warning, confirmed by direct inspection:** `shopify_variant_id` and `shopify_product_id` are real, live, heavily-used columns — but **no migration file in `supabase/migrations/` defines them.** They were applied directly against the production database outside the committed migration history (the same pattern documented in §4.3 for the `pg_cron` job). A new engineer who runs every migration in order against a fresh database will **not** get a working system — these two columns (and the live `pg_cron` job) must be reverse-engineered from the live Supabase schema, not from git. Do this before relying on `supabase/migrations/` as a complete source of truth.

### 2.3 Creating/updating the real Shopify cart

`syncShopifyCart()` creates or updates a real Shopify Storefront API `Cart` object via `lib/shopify/storefront.ts` — a hand-written GraphQL client (`cartCreate`/`cartLinesAdd`/`cartLinesRemove`/`cartDiscountCodesUpdate`/`cartGet`), authenticated with the `X-Shopify-Storefront-Access-Token` header (`SHOPIFY_STOREFRONT_ACCESS_TOKEN`), API version `2026-10`. This call never throws on failure — any error degrades to a warning; the visible Jawhara cart (priced via Supabase/`lib/discounts.ts`) is unaffected either way, so a Shopify outage never breaks browsing/adding-to-cart, only the eventual checkout redirect.

### 2.4 Checkout redirect + price-parity guard

Clicking "Till kassan" calls `goToCheckout()` (`cart-provider.tsx`): it forces one last sync (reusing the just-completed background one if the cart hasn't changed since), then compares Shopify's own `cart.cost.totalAmount` against Jawhara's own `/api/cart/totals` result (still `computeCheckoutTotals()` from `lib/discounts.ts`, unchanged) within ~1 öre tolerance. On any mismatch, an inapplicable discount code, or a missing `checkoutUrl`, it **refuses to navigate** and shows a Swedish error instead of sending the customer to a wrong price. On success: `window.location.href = checkoutUrl` — a hard redirect off the Next.js app entirely, onto Shopify's own checkout domain. **No Jawhara/Next.js code runs during payment.** `/kassa` (`app/(storefront)/kassa/page.tsx`) still exists only as a dead/compat route — nothing links to it anymore; it exists purely so an old bookmark doesn't 404, and it runs the identical sync-then-redirect logic with no UI of its own.

### 2.5 Confirmed bugs found and fixed building this (real lessons, not hypothetical)

1. **Shopify splits one variant's quantity across multiple cart lines whenever an automatic quantity discount (e.g. "3 för 2") applies.** Naively patching "the last line" on a quantity update silently dropped the other split line, and the orphaned line stuck around untouched on every later sync — **quantity and price crept upward on every resync.** Fixed by grouping all lines per `merchandiseId` first and never patching a partial split: any real change removes every existing line for that variant and adds one fresh line, letting Shopify's own discount engine recompute cleanly from scratch.
2. **Concurrent syncs against the same Shopify cart interleaved their remove/add mutations unpredictably server-side** — a rapid quantity click firing a second sync before the first's mutations had landed was the real mechanism behind a recurring "stuck checkout button"/price-mismatch bug (an earlier, narrower fix had only corrected what a *single* sync computed, never stopped two syncs from racing each other). Fixed with the `syncQueueRef` serializing promise queue mentioned in §2.1 — a call that arrives mid-flight waits its turn and syncs the truly-current cart, never a stale snapshot.
3. **No timeout on any cart/checkout network call** left the "Till kassan" button permanently disabled on a hung request, recoverable only by a full page refresh. Fixed with a shared `fetchWithTimeout()` (10-second hard ceiling) wrapping every cart/checkout fetch.
4. **Shopify webhook delivery does not follow HTTP redirects, and `jawhara.se` 308-redirects to `www.jawhara.se`.** Real paid orders never reached Supabase at all until every webhook subscription was explicitly repointed at `https://www.jawhara.se/api/webhooks/shopify` (the `www` subdomain specifically — see §4.1). This is a trap worth remembering for any future domain/webhook setup.
5. **A `bfcache`-restored page (browser back/forward) could show a stale, never-resolving price fetch.** Fixed with a `pageshow`-event-triggered forced re-fetch nonce in the cart-totals hook — unrelated to Shopify specifically, but part of the same "stuck button" bug family.
6. **The old Stripe-era webhook's atomic inventory decrement + oversell-rollback-and-refund logic was deliberately left untouched** (`app/api/webhooks/stripe/route.ts`) — it's irrelevant to the new storefront flow, but still correctly needed for the admin manual-order Stripe-link path, so it was not deleted along with the rest of the old checkout.

### 2.6 What's left of Stripe, precisely

- `app/api/checkout/route.ts` — **deleted**, confirmed (does not exist in the tree).
- `app/api/webhooks/stripe/route.ts` — **fully intact, unmodified, still live** — because `app/admin/(authenticated)/orders/new/actions.ts`'s manual-order "stripe_link" payment mode still calls `stripe.checkout.sessions.create(...)` directly for admin-created orders.
- `app/api/checkout/session/route.ts` (Stripe session-status lookup) and `app/(storefront)/kassa/bekraftelse/page.tsx` (the old Stripe confirmation/polling page) both still exist and still work — but are now reachable **only** from that admin-manual-order path, never from any customer-facing storefront link. The confirmation page's client-side Meta Pixel `Purchase` call (`trackPurchase`, still present in `lib/marketing/events.ts`) is, as a direct consequence, now effectively dead code for real sales — see §5.
- `lib/orders/refund-guard.ts`, the admin refund action, and the admin payments/settings page still read Stripe payment data for historical/manual orders — unchanged, still correct, still needed.
- A real code comment in `.env.local.example` states this explicitly: Stripe is "retired as the checkout provider... still required: admin order history/refunds/reporting for pre-migration orders... and the webhook route still exists for any already-created session."

---

## 3. Discounts — Still Computed Locally for Display, Enforced via Native Shopify Discounts

`lib/discounts.ts`'s `computeCheckoutTotals()` is unchanged in its own calculation logic from the original research (BXGY "3 för 2"/"Valfri Plånbok", order-percentage codes, VAT, the hardcoded free-shipping constant) — it's still what prices Jawhara's own cart drawer display and still what the price-parity guard (§2.4) compares Shopify's number against. **But it no longer determines what the customer is actually charged.**

`lib/shopify/discount-sync.ts`'s `syncDiscountToShopify(discountId)` pushes every admin-saved, `active`/`scheduled` discount into a **real native Shopify discount**, via the Admin GraphQL `discountAutomaticBxgyCreate/Update`, `discountCodeBxgyCreate/Update`, `discountAutomaticBasicCreate/Update`, or `discountCodeBasicCreate/Update` mutations (selected by the discount's `kind` × whether it's a BXGY shape). Legacy product/collection IDs stored on the discount are re-resolved to **live** Shopify GIDs via a `resolveItems()` helper (products via `products.shopify_product_id`, collections via a `collectionByHandle` GraphQL lookup, cached in-process) — the same staleness concern as §2.2's variant IDs applies here too. Deactivating a discount in Jawhara calls the corresponding `discountCodeDeactivate`/`discountAutomaticDeactivate` mutation (never deletes — reversible). Every sync outcome, including partial-resolution warnings, is written back to new `discounts.shopify_sync_status`/`shopify_sync_error`/`shopify_synced_at` columns, surfaced in the admin discount UI.

This is also *why* the price-parity guard in §2.4 can ever agree: Shopify's own cart only computes the "3 för 2"/"Valfri Plånbok"/code discounts correctly once this sync has actually pushed them there as real Shopify discounts. **If the discount-sync step is ever broken or behind, the price-parity guard will correctly start blocking checkout** rather than silently charging the wrong amount — this is intended, defensive behavior, not a bug to "fix" by relaxing the tolerance.

---

## 4. Order & Fulfillment Sync

### 4.1 Webhooks — the real-time path

`app/api/webhooks/shopify/route.ts` is the live entry point for order state changes. Seven topics are registered one-time via `scripts/shopify/register-webhooks.ts` (`ORDERS_CREATE`, `ORDERS_PAID`, `ORDERS_UPDATED`, `ORDERS_CANCELLED`, `FULFILLMENTS_CREATE`, `FULFILLMENTS_UPDATE`, `REFUNDS_CREATE`), all pointed at `https://www.jawhara.se/api/webhooks/shopify` — **the `www` subdomain specifically**, because Shopify's webhook delivery doesn't follow the apex domain's 308 redirect to `www` (§2.5, item 4). Each delivery is HMAC-SHA256-verified (`lib/shopify/webhook-verify.ts`, signed with `SHOPIFY_CLIENT_SECRET` — the same secret used for the Admin API OAuth client-credentials grant) and deduped on `X-Shopify-Webhook-Id` into a **new** `shopify_webhook_events` table (deliberately separate from the pre-existing, Stripe-only `webhook_events` table, which has a `NOT NULL stripe_event_id` column not reusable here) — insert-first, a unique-constraint conflict means "already processed"; on a processing failure the dedupe row is deleted so a genuine Shopify retry can reprocess.

The handler **never trusts the webhook's own JSON body as order data** — it only treats the webhook as a "something changed, go re-check" signal, then re-fetches the order fresh from the Admin GraphQL API (`syncSingleShopifyOrder`, in `lib/shopify/order-sync-shared.ts`) before writing anything.

### 4.2 The shared upsert function

`upsertShopifyOrder()` (`lib/shopify/order-sync-shared.ts`) is the **single function** used by both the real-time webhook path and the periodic/manual reconciliation sync (`lib/shopify/sync-orders.ts`) — orders/`order_items`/`payments`/`fulfillments`/`refunds` are all upserted keyed by `shopify_id`. Line items are matched to Jawhara's catalog via the **current** `shopify_product_id`/`shopify_variant_id` GID columns (§2.2) — never the legacy `shopify_id` column, which no longer matches real current-store orders.

On first sync of each order line item, the function freezes an **immutable snapshot** — `order_items.image_url`, `image_is_variant_specific`, `variant_title_snapshot` (new columns, migration `0041`) — of the purchased variant's image/title at that moment, so a later product edit, image reassignment, or deletion can never retroactively change what a historical order's emails or admin page display. Pre-existing rows were backfilled once via `scripts/backfill-order-item-snapshots.ts`.

### 4.3 Three independent schedulers hit the same reconciliation route — only one is reliable

`app/api/cron/sync-orders/route.ts` is called by **three** separate schedulers, each with its own bearer secret, distinguished by which secret matches and recorded as `source` on every run (`cron_sync_runs` table, migrations `0044`+`0046`):

| Scheduler | Secret | `source` tag | Real status today |
|---|---|---|---|
| Vercel Cron (`vercel.json`: `"schedule": "0 3 * * *"`, path `/api/cron/sync-orders`) | `CRON_SECRET` (Vercel attaches this automatically) | `cron_sync` | Live, but only once a day — the final, slow backstop. |
| GitHub Actions (`.github/workflows/sync-orders-recovery.yml`) | `EXTERNAL_CRON_SECRET` | `github_actions` | **Its automatic `schedule:` trigger was removed** (commit `1ff92d1`) after it was measured skipping ticks under GitHub's free-tier scheduler (two observed runs ~2h20m apart instead of the intended 5 minutes). Only `workflow_dispatch` (manual trigger) remains on disk today — it is **not currently running automatically**, only invocable by hand as an emergency fallback. |
| Supabase `pg_cron` (+ `pg_net`), every 5 minutes, running **inside** the Supabase Postgres instance itself | `SUPABASE_CRON_SECRET` | `pg_cron` | **The real, reliable, currently-active 5-minute path** — not subject to any external CI platform's scheduling throttling. |

**⚠️ Confirmed, important discrepancy**: `app/api/cron/sync-orders/route.ts`'s own code comment still describes the GitHub Actions path as "nominally every 5 minutes... kept as a secondary, free safety net" — that comment is stale; re-read the workflow file itself (only `workflow_dispatch` remains) rather than trusting the route's comment.

**⚠️ The `pg_cron` job itself is not defined anywhere in this git repository.** No migration file and no script contains the `cron.schedule(...)` SQL that set it up — the code comments in `app/api/cron/sync-orders/route.ts` even say "see the one-off setup script," but no such file exists under `scripts/` or `supabase/migrations/`. This job exists **only live inside Supabase's own Postgres instance** (queryable via the `cron.job` table from the Supabase SQL editor or `pg_cron`'s own views). A new engineer reproducing this infrastructure in an independent account must **query the live database directly to discover the exact schedule and the exact HTTP call it makes**, then write their own `cron.schedule(...)` SQL for the new project — it cannot be reconstructed from the git history alone. This is the second confirmed case of schema/infrastructure drift from git (the first being §2.2's GID columns) — treat `supabase/migrations/` as necessary but **not sufficient** for fully reproducing this system.

All three schedulers (plus the admin's manual "Sync from Shopify" button, same underlying function, `recoverySource` omitted) funnel through `syncOrdersFromShopify(recoverySource?)`. For any order found newly paid/cancelled within a 3-day recovery window, it fires the exact same Meta-CAPI-report/cancellation-email side effects the real-time webhook would have — safe against duplicate sends because every path shares the same atomic-claim columns (`orders.purchase_event_sent_at`, `orders.cancellation_email_sent_at` — see §5).

### 4.4 Side effects, fired only on a genuine state transition (`lib/shopify/sync-side-effects.ts`)

- **Newly paid** → `reportNewlyPaidPurchase()` → Meta CAPI purchase report (§5). This is the *only* Purchase signal Meta receives for real sales, since the customer never returns to a Jawhara-controlled page after paying on Shopify's own checkout domain.
- **Newly cancelled** → a Resend cancellation email, gated by an atomic `orders.cancellation_email_sent_at IS NULL` claim-update, so a cancellation caught by both the webhook *and* the admin's own `cancelOrder()` action can never double-send.
- **Order confirmation and refund emails are deliberately NOT sent from this app anymore** for real storefront sales — Shopify's own native "Order confirmation"/"Refund" customer notifications are the explicit system of record for those two events (business decision). `lib/email/order-confirmation.ts`/`refund-notification.ts` still exist and are still called from the (now customer-flow-dead) Stripe webhook and a manual test script — effectively vestigial for the live flow, not deleted only because the admin-manual-Stripe-order path still needs them.
- **Fulfillments created directly in Shopify sync into Supabase but deliberately never auto-email the customer** — Shopify's own fulfillment screen already lets staff choose to notify the customer, and this app has no way to know whether they already did; auto-emailing here would risk a guaranteed duplicate against the branded Resend shipping email Jawhara's own fulfillment action already sends (§4.5).

### 4.5 Two-way fulfillment sync (genuinely bidirectional, not just inbound)

`lib/shopify/fulfillment-sync.ts` makes real Admin GraphQL mutations, pushed **from** Jawhara admin **to** Shopify:

- `createShopifyFulfillment()` (via Shopify's FulfillmentOrder-based workflow) fires the instant a staff member clicks "Markera som skickad" in Jawhara admin — always with `notifyCustomer: false`, since Jawhara's own branded Resend shipping email (with correct, snapshotted purchased-variant images) is the only shipping email that's sent. If Shopify rejects the mutation, **no local fulfillment row is written and no email is sent** — Jawhara never claims "shipped" when Shopify itself disagrees. An order with no `shopify_id` (a manual order never pushed to Shopify) skips the Shopify call entirely.
- `updateShopifyFulfillmentTracking()`/`cancelShopifyFulfillment()` push an edit/cancel to Shopify **first**; the local Supabase row is only updated once Shopify confirms.
- The reverse direction (Shopify → Jawhara) arrives through the same webhook/`upsertShopifyOrder()` path covering `fulfillments`/`refunds` in the order query.
- **Refunds are one-way, Shopify → Jawhara, enforced in code**: the admin refund action explicitly refuses to create a refund when `order.source === "shopify"` — a Shopify-sourced order can only be refunded from Shopify Admin directly; Jawhara reflects it automatically once Shopify's own refund syncs back.

### 4.6 Test-order flagging

`orders.is_test_order` (migration `0043`) mirrors Shopify's own `test: true` order field (set via "Place test order" or the `orderCreate` API), captured on every upsert. Surfaced as an amber "Testorder" badge on the order detail page and every orders table, including the restricted `fulfillment_staff` view — added after a real incident where a test order was fulfilled by mistake during pipeline verification because it looked identical to a genuine one. `lib/marketing/capi-purchase.ts` checks this flag and never reports a test order's purchase to Meta as a real conversion.

### 4.7 Integration error logging / monitoring

`lib/monitoring/log-integration-error.ts`'s `logIntegrationError(source: "webhook"|"capi"|"cron_sync", message, context?, orderId?)` writes to a new `integration_errors` table (migration `0044`, admin-only RLS) — a durable, Supabase-queryable error log, since this project's operators have no convenient Vercel function-log access. Never throws itself. Called from the webhook route's catch block, the CAPI failure path, and the cron route's error aggregation. `cron_sync_runs` (same migration, `+source` column added in `0046`) records every reconciliation run's pulled/imported/error counts **per scheduler**, making a missed or underperforming scheduler visible individually rather than only in aggregate.

---

## 5. Meta Pixel & Conversions API — Rewired to the New Checkout

The architecture described in the original research (consent gating, `marketing_settings` DB config, hashed email/phone, event-ID dedup) is still structurally correct, but almost everything about *when* and *where* events fire changed because checkout no longer happens on a Jawhara-controlled page.

### 5.1 Client-side

- `ViewContent`/`AddToCart`/`InitiateCheckout` still fire from `lib/marketing/events.ts`, each now also mirrored into the new first-party analytics system (§6).
- **PageView-refire bug, previously flagged as a known gap, is now fixed.** `CookieConsentAndTracking` now fires `trackPageView()` on every client-side route change via a `usePathname()` effect (skipping its own first run, since the Pixel's inline init script already fires the very first PageView).
- `trackPurchase` still exists in `lib/marketing/events.ts` and is still called from `app/(storefront)/kassa/bekraftelse/page.tsx` — but that page is now unreachable from the real customer checkout flow (Shopify's hosted checkout never redirects back there). It only still fires for the admin manual-order Stripe-link path. **The browser Pixel `Purchase` event is effectively dead for real storefront sales.**

### 5.2 Server-side — now the only real Purchase signal (`lib/marketing/capi-purchase.ts`)

- Triggered from `app/api/webhooks/shopify/route.ts`'s newly-paid branch — a genuine server-to-server call, not a client fetch (this closes the gap the original research flagged).
- **Idempotency**: an atomic `UPDATE orders SET purchase_event_sent_at = now() WHERE purchase_event_sent_at IS NULL ... RETURNING id` claim, on its own column independent of `cancellation_email_sent_at`, so a Meta API failure can never block the customer-facing side of things and vice versa. Three independent callers can converge on this claim safely: the real-time webhook (`source: "webhook"`), the `pg_cron` recovery sweep (`source: "pg_cron"`), and the daily Vercel Cron (`source: "cron_sync"`) — whoever claims it first wins, no double-send.
- **Retries**: `postToMetaWithRetry()` — up to 3 attempts with increasing backoff, retrying only on 5xx/network errors (a 4xx — bad token, malformed event — fails fast, by design).
- **Latency/observability**: every attempt writes a row to a new `purchase_tracking_log` table (migration `0045`), spanning `payment_confirmed_at → detected_at → capi_submitted_at → capi_accepted_at`/`capi_error`, tagged by which `source` caught it — makes a real-time webhook that silently never fires *visible* (its purchase shows up tagged `cron_sync`/`pg_cron` instead of `webhook`) rather than invisible.
- **Real bug fixed**: originally, only a Meta-API-level failure released the idempotency claim; any *other* exception between claiming and sending (e.g. a transient Supabase read) left an order **permanently** marked "sent" with no event ever actually delivered and no possible retry, since the real-time webhook never re-processes an order once it's no longer newly-paid. Fixed by wrapping the entire post-claim path so any failure releases the claim.
- **Shopify test orders are excluded** (§4.6) — `is_test_order` is checked before any report is sent.
- **`user_data` is still hashed email/phone only** (SHA-256). **No `fbp`/`fbc`/client-IP/user-agent capture was added** — this gap from the original research is unchanged and still real, now arguably more important to close since there's no browser-side Purchase event left to carry that context at all.
- **Event-ID dedup scheme changed**: now `` `shopify_order_${order.shopify_id ?? order.id}` `` — replacing the old Stripe-session-id scheme (which no longer makes sense once Stripe isn't the checkout engine). A code comment explicitly notes: if a browser-side Purchase pixel is ever reconnected in the future (e.g. via a Shopify checkout web-pixel extension), it must reuse this exact `event_id` format for Meta's deduplication to work.
- A temporary, unauthenticated verification endpoint used once to confirm the real Meta Graph API call from production (the sandbox dev environment can't reach `graph.facebook.com` directly) was added and then fully removed in a follow-up commit — confirmed no trace remains.

### 5.3 Admin config path

Unchanged — still DB-driven via the `marketing_settings` table (`getMarketingSettings()`/`getPublicMarketingIds()`), no new Meta-specific env var added. The original research's finding that the admin UI's "encrypted token" claim is false (it's a plaintext column) was not touched by any of this work and should be assumed still true until separately re-verified.

---

## 6. First-Party Web Analytics (new system, separate from Meta/GA)

A real, currently-working system, distinct from Meta Pixel/GA4, added to answer questions Meta/GA increasingly restrict (session counts, conversion funnels) without relying on a third party's own dashboard.

- **Client** (`lib/marketing/first-party-analytics.ts`): logs `page_view`/`view_content`/`add_to_cart`/`initiate_checkout` events via `navigator.sendBeacon` (falling back to `fetch` with `keepalive`) to `app/api/analytics/track/route.ts`. Gated behind the exact same cookie-consent check as the Meta Pixel/GA4 — nothing is written before a visitor accepts. Uses a `localStorage` visitor id (persists across visits) and a `sessionStorage` session id (per visit).
- **Storage**: `analytics_sessions` (`id` text, `visitor_id`, `traffic_source` — one of `instagram`/`facebook`/`google`/`direct`/`other`, `landing_path`, `started_at`) and `analytics_events` (session-linked, `event_type`, `path`, `product_handle`/`product_title`) — migration `0047`. `id` is **client-generated** text (`crypto.randomUUID()`, with a non-crypto fallback for old browsers), not a Postgres-generated UUID, because the client labels an event with its own session id before the server has ever seen that session. RLS: admin-read-only; all writes go through the service-role client from the track route, never directly from a browser.
- **Admin surface**: `/admin/analytics` ("Webbplatsstatistik"), backed by `lib/admin/web-analytics.ts`'s `getWebAnalyticsMetrics()`, which calls four plain-SQL Postgres RPCs (`analytics_summary`/`analytics_top_products`/`analytics_traffic_sources`/`analytics_daily_visits`, all `security invoker` — deliberately *not* `security definer`, so the admin-only RLS policy is actually enforced on every call) doing Stockholm-timezone-correct date-boundary math inside Postgres itself (`at time zone 'Europe/Stockholm'`), rather than hand-rolled JS offset arithmetic that would get DST transitions wrong.
- **Purchases/conversion-rate are read from real `orders`** (`source in ('stripe','shopify')`, `financial_status = 'paid'`), never from a client-fired "purchase" beacon — so a dropped beacon can never under- or over-count a real sale.
- **Notable history, confirmed from the migration's own comment**: this feature was originally built on a different, sibling branch (`claude/determined-archimedes-dob6pv` — see the provenance note at the top of this document) that was never merged into the production line. It was live in production for about a week, collecting real visit data, then silently stopped the instant the old `/kassa` page was stripped during the Shopify migration (its tables/RPCs were orphaned — nothing in the new code called them anymore). It has now been restored/rebuilt on `magical-babbage-ne4n82`, along with a real bug fix: the original purchase-count query only ever counted `source = 'stripe'` orders, which would have permanently shown zero conversions post-migration.
- A separate, real admin-panel **performance** bug was fixed in the same work: every visible admin `<Link>` (sidebar/mobile-nav entries, every table row across orders/products/customers/discounts/reviews) was being Next.js-auto-prefetched, and each prefetch ran the *full* middleware auth check (`getUser()` + an `admin_users` lookup) against Supabase — measured at 48 auth calls for two page loads, with the orders list never reaching network-quiet within 30 seconds. Fixed by disabling prefetch on high-multiplicity links and deduplicating the (previously triple-redundant: middleware/layout/`requireAdmin()`) auth check via a single `React.cache()`-wrapped lookup.

---

## 7. Contact Form → Resend (new)

`app/api/contact/route.ts` replaces a prior client-side-direct-insert contact form. It validates (email regex, non-empty body), has a **honeypot** field (a hidden `website` input — a bot that fills it gets a fake success response with nothing actually sent), a **flood guard** (max 3 submissions per email address per 10 minutes, checked via a `contact_submissions` count query — no schema change needed), still inserts into `contact_submissions` regardless of whether the email send succeeds, then emails the submission via Resend to `store_settings.support_email` (falling back to a hardcoded `support@jawhara.se` if unset) with `replyTo` set to the customer's own address and a Swedish HTML+text body. `components/pages/contact-form.tsx` now POSTs here instead of writing to Supabase directly from the browser.

---

## 8. Admin Dashboard

Unchanged from the original research in its overall architecture (Supabase Auth + `admin_users` role check, three-layer defense-in-depth, `requireAdmin()`/`requireFullAdmin()`, `logAdminAction()` → `audit_log`, roles `admin`/`staff`/`fulfillment_staff`). What's new on this branch specifically:
- A "Testorder" amber badge on order lists/detail (§4.6).
- A new "Webbplatsstatistik" (analytics) admin page (§6).
- The admin performance fix described in §6 (prefetch + cached auth check) — relevant if you're extending the admin shell and wondering why links don't auto-prefetch anymore; that's deliberate.
- The manual/draft order creation feature's "stripe_link" payment mode is the one remaining live call site for Stripe's Checkout Session API (§2.6).

Everything else — product/collection/customer/discount/review CRUD, the visual storefront editor, settings, staff management, audit logging — is unchanged from the original research and still accurate. See Appendix A for file paths; not re-derived here for length.

---

## 9. Product / Catalog System

Unchanged in its fundamentals from the original research (read path via `lib/queries.ts`, `isVariantAvailable()` availability rule, cheapest-variant display pricing, product-template per-category PDP content, the draft/publish storefront visual editor, the WebP image pipeline). The one addition relevant here: **`products.shopify_product_id` and `product_variants.shopify_variant_id` are now the columns that matter for anything touching the live Shopify store** (checkout, discount sync, order sync — §2.2) — the legacy `shopify_id` column documented in the original research is now explicitly historical/stale and should not be used for anything that needs to match against the *current* Shopify store.

**Identifying handbag products for a new store's catalog export**: the original research's method (collection `vaskor-och-tillbehor`, or `template_suffix IN ('vaskor', 'erbjudande-vaskor')`) is unchanged and still valid, since none of this phase's work touched product categorization.

---

## 10. Database

### 10.1 New migrations since the original research (`0040`–`0047`)

| File | Summary |
|---|---|
| `0040_phase4_discount_shopify_sync.sql` | `discounts` gains `shopify_discount_id` (unique, nullable — a draft discount never synced has none), `shopify_sync_status` (`'synced'`/`'error'`), `shopify_sync_error`, `shopify_synced_at`. |
| `0041_shopify_fulfillment_email_sync.sql` | `fulfillments` gains `shopify_fulfillment_id` (unique), `shopify_fulfillment_order_id`, `notification_sent_at`, `shopify_sync_error`. `order_items` gains `image_url`, `image_is_variant_specific`, `variant_title_snapshot` (the immutable snapshot, §4.2). `orders` gains `confirmation_email_sent_at`, `cancellation_email_sent_at`, `cancelled_by_shopify`. `refunds` gains `notification_sent_at`. New `shopify_webhook_events` table (raw webhook-delivery dedup, separate from the Stripe-only `webhook_events`). |
| `0042_meta_capi_purchase_tracking.sql` | `orders.purchase_event_sent_at` — the CAPI idempotency claim column (§5.2). |
| `0043_order_is_test_flag.sql` | `orders.is_test_order` (§4.6). |
| `0044_integration_monitoring.sql` | New `integration_errors` and `cron_sync_runs` tables (§4.7). |
| `0045_purchase_tracking_log.sql` | New `purchase_tracking_log` table (§5.2). |
| `0046_cron_sync_runs_source.sql` | `cron_sync_runs.source` (§4.3). |
| `0047_web_analytics.sql` | New `analytics_sessions`/`analytics_events` tables + 4 aggregation RPCs (§6). Uses `if not exists`/`or replace` throughout because — per its own comment — these objects were already created directly against production by an earlier session on a different numbering/branch, and already hold real historical data; this migration brings that schema into *this* branch's version-controlled history without destroying what's already there. |

### 10.2 Confirmed schema drift from `supabase/migrations/` — read before trusting the migrations folder as complete

Two real, confirmed cases where the live database schema does **not** match what's in git:
1. **`products.shopify_product_id` / `product_variants.shopify_variant_id`** (§2.2) — live, heavily used, not defined in any committed migration.
2. **The `pg_cron` job itself** (§4.3) — live, running every 5 minutes, defined only inside Supabase's own Postgres instance, not in any committed migration or script.

**Practical implication**: before reproducing this database in a new/independent Supabase project, don't just replay `supabase/migrations/` in order — also pull the live production schema directly (e.g. `supabase db diff` against production, or a direct `information_schema` query) to catch anything else that might have drifted the same way, and separately query `cron.job` in the live Supabase SQL editor for the exact `pg_cron` schedule/call before trying to recreate it elsewhere.

### 10.3 Everything else

The original research's baseline schema (migrations `0001`–`0039`), RLS pattern (`is_admin()`), database functions (`decrement_inventory`/`force_decrement_inventory`), and the confirmed absence of any `*_shopify_id_map` table style is all still accurate and unchanged by this phase of work.

---

## 11. Deployment

### 11.1 What's new to configure

In addition to the original research's deployment steps (§8 of the prior version): register the 7 Shopify webhook topics against the **`www`** subdomain specifically (§4.1), create and set `SHOPIFY_STOREFRONT_ACCESS_TOKEN` (§1.2), set up the three cron secrets (`CRON_SECRET` is Vercel-automatic; `EXTERNAL_CRON_SECRET` and `SUPABASE_CRON_SECRET` need to be generated and matched between the caller and `app/api/cron/sync-orders/route.ts`'s own `process.env` reads), and — per §10.2 — manually recreate the `pg_cron` schedule inside the new Supabase project's SQL editor, since it cannot be replayed from a migration file.

### 11.2 Everything else

Unchanged — see the original research's deployment reproduction steps (Supabase project + migrations + storage bucket, Stripe account for the admin-manual-order rail only, Resend account/domain verification, first-admin-user bootstrap, env-var-before-first-build ordering, Vercel-plan gotchas) for the parts of the stack that didn't change in this phase.

---

## 12. New Store Implementation — Updated Guidance

The original research's §9 ("What to reuse as-is" / "What needs new configuration" / "Building the new frontend") is still directionally correct, with these updates given everything above:

- **The checkout decision is now genuinely open, not settled by what exists here.** This codebase currently has *two* checkout rails, neither of which may be what the new store wants: (a) a from-scratch Shopify Storefront-cart + hosted-checkout integration (the real current live path — §2), reusable if the new store will also use Shopify as both catalog *and* checkout; or (b) the dormant-but-intact Stripe integration (§2.6), reusable if the new store wants its own, fully independent checkout not tied to any Shopify store at all. Decide which one the new store actually wants before porting either — don't default to "whatever this repo currently does."
- **If the new store goes the Shopify-checkout route**: review `claude/epic-gates-zdrpdn`'s `scripts/shopify/migrate-collections.ts`/`migrate-products.ts`/`untrack-inventory.ts` (see the provenance note at the top of this document) before writing new catalog-migration tooling — it's already a working, idempotent Supabase → new-Shopify-store product/collection importer, built for exactly this kind of handoff.
- **Discount sync pattern (`lib/shopify/discount-sync.ts`, §3) is a reusable template** regardless of which checkout rail is chosen, if the new store also wants Jawhara-style promotions (BXGY, order-percentage codes) to be enforced natively by whichever payment platform it ends up on rather than recomputed at charge time.
- **The two-way fulfillment sync pattern (§4.5) and the three-scheduler recovery-sweep pattern (§4.3) are both reusable architectural templates** for any integration where a webhook alone can't be fully trusted — worth carrying the *pattern* forward even if the specific Shopify calls change.
- **New Meta Pixel configuration**: everything from the original research's §9.5 still applies (set via `/admin/settings/marketing`, no catalog setup performed as part of this research). Given the current system now has *no* browser-side Purchase event firing for real sales (§5.1), a new store built on a from-scratch checkout (option (b) above) should strongly consider keeping a working client-side Purchase pixel rather than inheriting this gap — it's a direct consequence of the hosted-checkout redirect, not a decision that was deliberately chosen for its own sake.

---

## 13. Known Limitations (updated)

Everything in the original research's §10 that wasn't touched by this phase (shipping still hardcoded free/Sweden-only, staff role granularity, 17TRACK needing an API key, no `product_type` data, `@tanstack/react-table` unused, etc.) is unchanged and still accurate. New/updated items from this phase:

1. **Two confirmed cases of schema/infrastructure drift from the git-tracked migrations** (§10.2) — the Shopify GID columns and the live `pg_cron` job. Treat `supabase/migrations/` as necessary but not sufficient.
2. **The GitHub Actions recovery-sweep code comment is stale** (§4.3) — it describes a schedule that was deliberately removed; only the live `pg_cron` job and the daily Vercel Cron are actually automatic today.
3. **No fbp/fbc/client-IP/user-agent attribution data is captured for Meta CAPI**, still — and now arguably more important to close since there's no browser-side Purchase event left to carry any of that context at all for real sales.
4. **The browser Pixel `Purchase` event and the old `/kassa/bekraftelse` confirmation page are dead code for real storefront sales** — they only still execute for the admin manual-order Stripe-link path. Don't assume either is exercised by a real customer purchase.
5. **Real, apparently-unmerged work exists on other branches** (see the provenance note at the top) — a new-store engineer should at least skim `claude/determined-archimedes-dob6pv` (review-request emails, Meta product-feed fixes, a "3 för 2" badge) and `claude/epic-gates-zdrpdn` (new-Shopify-store catalog migration scripts) before assuming `magical-babbage-ne4n82` is the single complete picture of everything ever built for this project.
6. **Order confirmation/refund emails are not sent by this app for real sales** — if a new store needs its own branded confirmation/refund emails rather than relying on a platform's native notifications, this needs to be deliberately re-enabled/rebuilt, not assumed to already work because `lib/email/order-confirmation.ts` still exists in the codebase.

---

## Appendix A — Quick File-Path Reference (updated)

| Concern | Key files |
|---|---|
| Shopify Storefront cart sync | `lib/shopify/storefront.ts`, `lib/shopify/cart-sync.ts`, `app/api/shopify-cart/sync/route.ts` |
| Checkout redirect | `components/cart/cart-provider.tsx` (`goToCheckout`), `app/(storefront)/kassa/page.tsx` (now a dead compat route) |
| Discount sync to Shopify | `lib/shopify/discount-sync.ts` |
| Shopify webhooks | `app/api/webhooks/shopify/route.ts`, `lib/shopify/webhook-verify.ts`, `scripts/shopify/register-webhooks.ts` |
| Order/fulfillment sync | `lib/shopify/order-sync-shared.ts`, `lib/shopify/sync-orders.ts`, `lib/shopify/fulfillment-sync.ts`, `lib/shopify/sync-side-effects.ts` |
| Recovery scheduling | `app/api/cron/sync-orders/route.ts`, `vercel.json`, `.github/workflows/sync-orders-recovery.yml` (manual-only), the live Supabase `pg_cron` job (not in git) |
| Meta CAPI | `lib/marketing/capi-purchase.ts` |
| First-party analytics | `lib/marketing/first-party-analytics.ts`, `app/api/analytics/track/route.ts`, `lib/admin/web-analytics.ts`, `app/admin/(authenticated)/analytics/page.tsx` |
| Contact form | `app/api/contact/route.ts`, `components/pages/contact-form.tsx` |
| Integration monitoring | `lib/monitoring/log-integration-error.ts` |
| Legacy Stripe (admin-manual-order rail only) | `app/api/webhooks/stripe/route.ts`, `app/api/checkout/session/route.ts`, `app/(storefront)/kassa/bekraftelse/page.tsx`, `app/admin/(authenticated)/orders/new/actions.ts` |

Everything else (admin dashboard CRUD, database baseline, product/catalog fundamentals, image pipeline) is unchanged — see the original research's own Appendix A, reproduced in substance throughout §8–§9 above.

---

*Document generated by read-only codebase research against `claude/magical-babbage-ne4n82`, published on `claude/jawhara-handover-update`. Every claim above traces to a specific file, migration, commit, or direct live-file read at the time of writing. No credentials, tokens, passwords, or customer data are included anywhere in this document — only environment variable names and table/column names.*
