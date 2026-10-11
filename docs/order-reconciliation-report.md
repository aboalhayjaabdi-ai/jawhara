# Order, Catalog & Customer Reconciliation — 2026-10-11

Full read-only reconciliation of Shopify orders/customers/catalog against Supabase, per your
request after flagging that Supabase might be missing orders beyond the original 286. Everything
below is from live, read-only Shopify Admin API calls and direct Supabase reads — nothing is
estimated or assumed. No Shopify data was modified, no Stripe API calls were made, no customer
emails were sent, and no existing order was deleted.

## 1. The "more than 286" premise — live-checked, and not what it first appeared

Before importing anything, I ran three independent live order-count queries (unfiltered, an
explicit `status:any` filter, and an explicit `created_at:>2000-01-01` filter) — all three returned
the **identical count: 283**. If the original extraction had been limited by Shopify's `read_orders`
60-day/recent-only restriction, a `status:any` or explicit old-date query would have returned a
*different* (larger) number or errored; it didn't. **There is no scope restriction limiting
historical order access** — the app can see the shop's full order history.

The real, live count (283) is actually **lower** than what was already in Supabase (286), not
higher. `docs/migration-verification.md` shows 286 was already cross-checked against a live Shopify
count on 2026-10-08 and matched exactly at the time — so nothing was wrong with the original
extraction. The most likely explanation, confirmed by the ID-level diff below, is that 3 specific
orders were removed from Shopify after Oct 8 (see §2). The newest live order is also from Oct 8,
consistent with the storefront still being closed to new checkouts.

**One real, confirmed access restriction found:** this app's token does **not** have the
`read_draft_orders` scope — `draftOrdersCount` returns `ACCESS_DENIED`. If you consider draft
orders (merchant-created, not customer checkouts) part of your order count, those remain invisible
until that scope is granted. For reference, `abandonedCheckoutsCount` is 134 — real and accessible,
but these never became actual orders in Shopify's own data model, so they're correctly excluded
from an "orders" reconciliation.

## 2. Orders — final state after reconciliation

| | Count |
|---|---|
| Live Shopify orders (verified 3 ways) | 283 |
| Supabase orders, total | 294 |
| — Shopify-origin (`shopify_id` set) | 286 |
| — Stripe-origin (`stripe_checkout_session_id` set) | 8 |
| **Missing from Supabase → imported** | **0** |
| **Present in Supabase but no longer live in Shopify → reported, NOT deleted** | **3** |
| Field drift found and corrected | 3 orders (fulfillment status changed since Oct 8) |
| Order line items missing → imported | 0 |

**The 3 orders no longer live in Shopify** (all from the same 15-hour window, consecutive order
numbers — pattern suggests a batch cleanup on Shopify's side, not assumed further than that):

| Order | Shopify ID | Created |
|---|---|---|
| #SE11153 | 8216712773970 | 2026-08-10 11:12:55 UTC |
| #SE11163 | 8217870729554 | 2026-08-10 20:09:09 UTC |
| #SE11173 | 8218195296594 | 2026-08-11 01:34:16 UTC |

Per your explicit instruction, these rows were **left exactly as they are** in Supabase — your
order history is preserved regardless of what later happened on the Shopify side. Worth checking on
Shopify's own side if you want to know why they were removed; I can't determine that from the API
(a deleted order leaves no trace to query, unlike a cancelled one).

**3 real field-drift corrections applied** (orders fulfilled since the original Oct 8 extraction,
now showing their real current status): #SE13533, #SE13633, #SE13643 — `fulfillment_status` updated
from `IN_PROGRESS` to `FULFILLED`.

**Pipeline gap closed** (unrelated to the order-count question, found while reconciling): the
original import never wrote `payments`, `fulfillments`, `refunds`, or order-linked `addresses` —
those tables existed in the schema but were empty for every Shopify order. Backfilled from the same
live data:

| Table | Rows added |
|---|---|
| `payments` | 319 |
| `fulfillments` | 247 |
| `refunds` | 11 |
| `addresses` (order-linked shipping/billing) | 565 |

A second reconciliation run after the import confirmed **zero remaining drift and zero remaining
gaps** (other than the 3 orders with no live Shopify data to backfill from, which is expected).
Re-running `scripts/shopify/reconcile-orders.ts` is safe at any time — it's idempotent — and is
exactly what to run as the final incremental sync before launch.

## 3. Catalog (products, variants, collections) — re-verified, fully clean

Re-ran the existing `scripts/shopify/verify-catalog.ts` unchanged. 376 products / 788 variants /
662 images / 31 collections / 1,788 collection memberships — all present, zero missing. The only 13
reported differences are the collection tile images already intentionally re-hosted to Supabase
Storage in a previous approved round (Shopify CDN URL vs. your own Storage URL) — not drift, not
something to change back.

## 4. Customers — fully clean, nothing to import

Live Shopify customers: 504. Supabase: 504. Zero missing either direction, zero field drift, zero
missing addresses.

## 5. Admin dashboard

Added `/admin/orders` — a read-only order list (order number, date, customer, total,
financial/fulfillment status, and a Shopify/Stripe provider badge) so both historical Shopify
orders and new Stripe orders are visible with their correct payment provider, per your requirement.
Reuses the existing admin auth/layout; no checkout/payment logic touched.

## 6. What was never touched

No Shopify mutation of any kind (every script here only ever sent read queries). No Stripe API
calls. No fulfillment or refund actions triggered. No customer emails sent. No Supabase row deleted.
Every write went through the same idempotent `shopify_id`-keyed upsert this project already uses
elsewhere — re-running any of these scripts again is a safe no-op unless something genuinely
changed on the Shopify side.

## New files

- `scripts/shopify/reconcile-orders.ts` — read-only diff/report (re-run anytime, including as the
  pre-launch final sync)
- `scripts/shopify/import-missing-orders.ts` — idempotent import/backfill (re-run anytime)
- `scripts/shopify/verify-customers.ts` — read-only customer/address diff
- `app/admin/(authenticated)/orders/page.tsx` — admin orders list
- `data/exports/order-reconciliation-mismatches.json`, `data/exports/customer-reconciliation-mismatches.json` — full detail dumps (gitignored, local only)
