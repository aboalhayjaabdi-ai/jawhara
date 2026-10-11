# Order Reconciliation — the 283 vs. 400 discrepancy (2026-10-11, superseding the earlier report)

## Summary

Your Shopify Admin showed **400 orders**. This project's reconciliation tooling only ever found
**283**. You asked for a thorough re-investigation rather than trusting the earlier report's
conclusion that the counts already agreed. That re-investigation found a real, confirmed cause —
**400 was always correct**, and the 283 was an artifact of a Shopify API permission restriction,
not a data problem. All 400 orders are now imported into Supabase, with zero duplicates and zero
changes to any original Shopify order.

## 1. Root cause: a silent 60-day visibility window, not a data gap

The dedicated migration app's Shopify token has the standard `read_orders` scope, but **not**
`read_all_orders`. Shopify enforces this with no error and no visible signal: `read_orders`
transparently restricts the `orders`/`ordersCount` API fields to a **rolling ~60-day window**.
Every query variant run through that token — unfiltered, `status:any`, an explicit old
`created_at` filter, full cursor pagination — agreed on 283, because all of them were running
through the same restricted window. That internal agreement is exactly why the original report
concluded there was no restriction; it checked whether the queries *disagreed with each other*,
not whether they matched the real, unrestricted total.

**Direct proof**: a second Shopify connection available in this environment, with the broader
`read_all_orders` scope, queried against the exact same store (`1tq41d-4y.myshopify.com`) and
returned **exactly 400** — matching Shopify Admin's own displayed count precisely. The oldest
order visible to the restricted token was #SE11183 (created 2026-08-12 — almost exactly 60 days
before this investigation). The real oldest order, visible only through the broader connection, is
**#1001** (created 2026-05-15). Every order from 2026-05-15 through 2026-08-11 — 117 orders — was
completely invisible to the restricted token, while remaining fully visible, live, and unmodified
in Shopify Admin the whole time.

## 2. Correcting the earlier report's "3 orders deleted" claim

The earlier report concluded that orders #SE11153, #SE11163, and #SE11173 had been removed from
Shopify, because they appeared in an Oct 8 snapshot but not in an Oct 11 live re-pull. That
conclusion is now confirmed wrong. All three were created Aug 10–11 — **before** the 60-day
cutoff. They did not disappear: they aged out of the restricted token's moving window between the
two extraction dates (the window reached back to ~Aug 9 on Oct 8, and only to ~Aug 12 by Oct 11).

This is now directly confirmed in Supabase: all three orders are present, with real data —

| Order | Shopify ID | Created | Financial status | Fulfillment status |
|---|---|---|---|---|
| #SE11153 | 8216712773970 | 2026-08-10 11:12 | PAID | FULFILLED |
| #SE11163 | 8217870729554 | 2026-08-10 20:09 | PAID | FULFILLED |
| #SE11173 | 8218195296594 | 2026-08-11 01:34 | PAID | FULFILLED |

No Shopify order was ever deleted. No Supabase row was ever deleted either, at any point in this
process.

## 3. The fix: how the missing orders were imported

Per your explicit approval, the full order history was pulled **read-only** through the
already-connected, broader-scoped Shopify app (not the restricted dedicated migration app), using
only `ordersCount`/`orders` read queries — no mutation of any kind was made against Shopify at any
point. All 400 orders (not just the 117 missing ones) were pulled, written to
`data/exports/orders-mcp-backfill.jsonl`, and imported via the new
`scripts/shopify/import-mcp-backfill-orders.ts`, which reuses the exact same idempotent
`shopify_id`-keyed upsert pipeline (`upsert(table, rows, "shopify_id")`, a real
`ON CONFLICT (shopify_id) DO UPDATE`) already proven safe by `import-missing-orders.ts`. Re-running
it is a safe no-op.

**Before → after:**

| | Before | After |
|---|---|---|
| Live Shopify orders (full history, confirmed via the broader connection) | 400 | 400 (unchanged — nothing was ever written to Shopify) |
| Supabase orders, total | 294 | **408** |
| — Shopify-origin (`source = 'shopify'`) | 286 | **400** |
| — Stripe-origin (`source = 'stripe'`) | 8 | 8 (unchanged) |
| `order_items` | 731 | 983 |
| `payments` | 319 | 474 |
| `fulfillments` | 247 | 358 |
| `refunds` | 11 | 34 |
| `addresses` | 1,130 | 1,364 |

Net new Shopify-origin order rows: 114 (not 117), because 3 of the 117 orders invisible to the
restricted token were already present in Supabase from an earlier, less-restricted extraction
window (see §2) — those 3 were updated in place with their current, real data, not duplicated.

Every column — order number, date, totals, currency, status, line items, payments, fulfillments
with tracking, refunds, shipping/billing addresses — came directly from Shopify's own fields via
the same field mapping this project's existing import scripts already use. Nothing was recomputed,
estimated, or invented.

## 4. Getting `read_all_orders` on the dedicated app (for durable, future self-service syncs)

The one-time backfill above used a broader-scoped connection available only inside a Claude Code
session. The **deployed Jawhara Admin app** — manual re-runs of `scripts/shopify/reconcile-orders.ts`,
and Phase 2's "Sync from Shopify" button — only ever has the dedicated migration app's own
restricted token, which still can't see anything older than ~60 days. To make future syncs fully
self-service, request the broader scope on that app:

1. Open the **Dev Dashboard** (dev.shopify.com) and find the app that mints the token
   (match its Client ID to `SHOPIFY_CLIENT_ID` in `.env.local`).
2. Go to that app's **API access** page.
3. Find the **"Read all orders"** access-request card (listed separately from the base
   `read_orders` scope you already have).
4. Click **Request access** and fill in the justification field — e.g. "Internal reconciliation
   and ongoing incremental sync between Shopify and our own independent order-management system;
   needs full historical order visibility, not just the last 60 days."
5. Submit. Shopify reviews this request; there is no published turnaround-time guarantee, so it
   may take anywhere from hours to longer.
6. Once approved, **no code change is needed** — the app's existing OAuth client-credentials flow
   picks up the new scope automatically on its next token mint.

Until this is approved, `reconcile-orders.ts` and the "Sync from Shopify" button will correctly
catch any *new* order placed from now on, but will report every one of the 117 historical orders as
"missing from live Shopify" if re-run — that's expected (they're outside its 60-day view), not a
regression, and not something to act on.

## 5. What was never touched

No Shopify mutation of any kind — every call made throughout this investigation and fix, through
both Shopify connections, was a read query. No Stripe API call. No fulfillment or refund action
triggered. No customer email sent. No Supabase row deleted. Every write went through the same
idempotent `shopify_id`-keyed upsert this project already uses everywhere else — re-running
`import-mcp-backfill-orders.ts` again is a safe no-op.

## 6. Catalog and customers — unaffected, still clean

Re-confirmed unaffected by this correction (unchanged from the original reconciliation pass):
376 products / 788 variants / 662 images / 31 collections / 1,788 collection memberships all
present with zero drift; 504 customers present in both Shopify and Supabase with zero missing
addresses either direction.

## New files from this fix

- `data/exports/orders-mcp-backfill.jsonl` — the full 400-order raw pull (gitignored, local only)
- `scripts/shopify/import-mcp-backfill-orders.ts` — the idempotent import step (re-runnable)
- `supabase/migrations/0012_phase2_order_management.sql` — adds `orders.source` (shopify/stripe/manual)
  and the Phase 2 order-management schema (see the Phase 2 implementation report for the rest)
