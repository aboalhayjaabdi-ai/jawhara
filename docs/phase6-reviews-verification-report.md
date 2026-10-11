# Phase 6 verification report — independent product review management

Date: 2026-10-11. Branch: `claude/festive-pasteur-77mezq`.

## Scope

A complete, independent review management system over the existing imported-Judge.me `reviews`
table: moderation (pending/approved/rejected) with store-wide stats, verified-purchase detection
backed by real order data where a signal genuinely exists, merchant replies rendered publicly on
the storefront, manual review creation, and full edit/delete — all against real Supabase data, on
the existing Shopify-inspired admin design. The 15 real imported Judge.me reviews were preserved
exactly as they were throughout, confirmed both before/after in the database and live, end-to-end,
through the new admin UI itself. Every standing constraint was preserved: the live Shopify store
was never written to, the production domain/DNS was never touched, and `app/api/checkout/route.ts`,
`app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` are confirmed byte-for-byte unchanged
(see **Diff review** below) — this phase never touches commerce logic.

## 1. Ground-truth research before building anything

Before writing code, a dedicated research pass re-confirmed the exact state of the real `reviews`
table and its only two read call sites (`lib/queries.ts`'s PDP loader, `product-detail.tsx`'s
render), and the storefront's data-access client. Three facts shaped the whole design:

- **The storefront reads through the anon-key, RLS-gated client** (`lib/supabase/client.ts`), not
  the service-role client. This meant moderation could be made structurally real — not just an
  admin-UI label — by changing the RLS policy itself: shoppers only ever see `status = 'approved'`
  rows, enforced by Postgres, the same pattern already used for `products.status = 'active'`.
- **The imported Judge.me rows have no reviewer email.** Verified-purchase detection can only ever
  be computed for a *new* review where the admin supplies a real customer email — it is never
  retrofitted onto the 15 imported rows, whose `verified_buyer` flag is left exactly as imported.
- **Real orders have a usable email + per-product line items.** `orders.email` and
  `order_items.product_id` support a genuine "did this email actually buy this product" check,
  using the same case-insensitive email matching and `paid`/`partially_refunded` financial-status
  set already proven correct in the `customer_order_stats` view from Phase 4.

## 2. Database migration

- **`0019_phase6_reviews.sql`** — adds to `reviews`: `status` (`'pending'|'approved'|'rejected'`,
  default `'approved'` so all 15 existing rows stay visible, never silently hidden by the
  migration itself), `source` (`'judgeme'|'manual'`, default `'judgeme'`), `customer_email`,
  `moderated_at`/`moderated_by`, `merchant_reply_body`/`merchant_reply_at`/`merchant_reply_by`,
  `updated_at`. Replaces the `"public read"` RLS policy with `status = 'approved' or is_admin()`
  (mirrors `products`/`discounts` exactly) and adds an `"admin write"` policy for defense-in-depth
  parity with every other admin-managed table — actual admin writes go through the service-role
  client, same convention as every prior phase. Confirmed after applying: all 15 real rows
  backfilled to `status='approved', source='judgeme'` with every original field untouched.

## 3. Verified-purchase detection ("where supported")

`lib/admin/review-verified-purchase.ts`'s `checkVerifiedPurchase(customerEmail, productId)` is the
single place this is ever computed: it looks up real orders by case-insensitive email match,
filters to `paid`/`partially_refunded`, and checks whether any of those orders' `order_items`
actually line up with the product. It returns `false` whenever no email is given or no match is
found — it never guesses `true`. The manual review creation action calls this automatically when
an email is supplied, rather than trusting an admin-ticked checkbox; with no email, a review is
created unverified, correctable afterward on the edit page for out-of-band/historical cases.

## 4. Honest stats, never guessed

`lib/admin/review-stats.ts`'s `getReviewStats()` computes total, average rating, the full 1–5
distribution, pending/approved/rejected counts, verified count/percent, and how many reviews have
a merchant reply — all live from the real table, never a stored/stale column. A sibling
`getTopReviewedProducts()` ranks products by real approved-review count for the stats view.

## 5. Moderation queue and detail/edit UI

`/admin/reviews`: stats tiles, search (author/body/email), status/rating/source/verified filters,
sort, bulk-select with approve/reject/pending/delete (`components/admin/reviews-table.tsx`,
`reviews-filter-bar.tsx`, `app/admin/(authenticated)/reviews/actions/bulk.ts`).

`/admin/reviews/[id]` (`components/admin/review-form.tsx`): edit rating/author/body/verified-buyer/
status, with a typed-confirmation delete flow matching the Phase 3–5 convention
(`app/admin/(authenticated)/reviews/[id]/actions.ts`'s `updateReview`/`deleteReview`). A status
change stamps `moderated_at`/`moderated_by`. A separate merchant-reply card
(`components/admin/review-reply-card.tsx`, `setMerchantReply`) lets an admin write, update, or clear
a public reply at any time, independent of the moderation decision itself.

`/admin/reviews/new` (`components/admin/new-review-form.tsx`, reusing the existing
`/api/admin/products/search` picker endpoint from Phase 3): creates a `source: 'manual'` review,
computing `verified_buyer` via the real-order check above when an email is given.

Every mutation calls `requireAdmin()` then `logAdminAction()`, consistent with every prior phase.

## 6. Storefront: merchant replies render publicly

`lib/queries.ts`'s review select (already RLS-filtered to approved rows) now also selects
`merchant_reply_body`/`merchant_reply_at`. `components/product/product-detail.tsx` renders a reply,
when present, directly under the customer's own review text in the existing review-card style —
confirmed live against a real product (`x-link-armband-1`) by temporarily setting and then
removing a test reply value and observing it appear/disappear on the rendered page.

## 7. Nav

`components/admin/admin-nav.ts`: added `{ href: "/admin/reviews", label: "Recensioner" }` between
Rabatter and Produktmallar.

## 8. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including all three new `/admin/reviews` routes
  compiling correctly.
- **Direct functional test** (disposable rows, cleaned up after, 14/14 checks passed): baseline
  confirmed at exactly 15 real reviews, all `status='approved'`; a manual review created and
  moderated through approve → merchant-reply → stats update; `checkVerifiedPurchase` confirmed
  `false` for a non-purchasing email and **`true` for a real customer's real paid order against
  the real product they bought**; `getReviewStats`/`getTopReviewedProducts` ran without error;
  **RLS proven directly**: the public (anon-key) client could see the approved test review but
  could not see a rejected one, for the same product; cleanup left the table back at exactly 15
  rows.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **12/12 checks passed** — login; moderation queue
  loads with stats tiles and all 15 real reviews visible (read-only spot-check, never clicked
  into/saved); create a manual review; approve it and save; set a merchant reply; reload and
  confirm the reply persisted; a status filter loads correctly; delete the test review via the
  checkbox-confirmation flow; **a final database check confirmed all 15 real Judge.me reviews were
  still `status='approved', source='judgeme'`**, unchanged; the live storefront PDP still renders.
- **Live storefront spot-check**: a merchant reply was temporarily set on a real review (on
  `x-link-armband-1`), confirmed to render under the "Svar från Jawhara" heading on the real PDP,
  then removed — proving the public-facing path end-to-end against real content, not just the
  admin side.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`, `app/api/webhooks/stripe/
  route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte unchanged. `git status`
  shows exactly three modified pre-existing files (`admin-nav.ts`, `lib/queries.ts`'s review select,
  and `product-detail.tsx`'s reply rendering); everything else is new.
- All disposable test data (reviews, the test admin account, ad-hoc verification/cleanup scripts)
  was deleted/removed after use; none of it is part of this commit.

## Known, deliberate scope cuts

No customer-facing review submission form — the request was for managing imported/merchant-entered
reviews, not building a new public review-collection flow; this can be added later without
touching the schema (it already supports a `'pending'` status for exactly that use). Verified-
purchase detection is one-directional and best-effort: it never retrofits the 15 Judge.me rows
(no email was ever captured for them) and only runs at manual-review creation time, not as an
ongoing background re-check. No email notification is sent to a customer when a merchant reply is
posted — out of scope for this phase, consistent with not expanding the existing Resend
integration without being asked.

## Files touched

12 new files (the migration, `lib/admin/reviews-filters.ts`, `lib/admin/review-stats.ts`,
`lib/admin/review-verified-purchase.ts`, the reviews admin pages/actions, and 5 new components)
plus 3 modified files (`components/admin/admin-nav.ts`, `lib/queries.ts`,
`components/product/product-detail.tsx`). Full list available via `git status`.
