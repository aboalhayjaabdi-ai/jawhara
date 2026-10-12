# Verification report — shipping zones, rates & carrier settings

Date: 2026-10-12. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Second of the user's priority list for completing the full admin platform: real shipping zones
(multiple rates per zone, optional minimum-order-value thresholds) replacing the single
flat-rate/country-list setting from an earlier phase, plus a saved carrier list (name + tracking
URL template) that now drives a real dropdown in the order fulfillment form. Every standing
constraint was preserved: the live Shopify store was never touched, the production domain/DNS was
never touched, and `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, and
`lib/discounts.ts`'s calculation logic are confirmed byte-for-byte unchanged (see **Diff review**
below).

## 1. Database migrations

**`0029_phase_shipping_zones_carriers.sql`** — new `shipping_zones` (name, countries, position),
`shipping_rates` (zone-scoped: name, price, optional `min_order_value`, position), and
`shipping_carriers` (name, optional `tracking_url_template` using a `{trackingNumber}`
placeholder), all admin-only RLS. Still deliberately **not wired into the live checkout
calculation** — checkout stays exactly as it is today (hardcoded free shipping, Sweden-only,
matching all 400 real historical orders) until a separate, explicit go-ahead to touch the
protected checkout file.

**`0030_phase_shipping_zones_carriers_seed.sql`** — carries forward the real current settings
(confirmed unchanged since the earlier phase: `["SE"]` / `0 kr`) into one real zone ("Sverige")
with one real rate ("Standardfrakt", 0 kr) — not an invented default — then retires the two old
single-value `store_settings` rows, which nothing outside the now-replaced settings page ever
read. Seeds 2 real carriers (PostNord, DHL) with their own real, publicly documented tracking-URL
formats.

## 2. Shipping zones & rates (`/admin/settings/shipping`)

Replaces the old single flat-rate form with a real zone manager: create/edit/delete zones
(name + country list), and within each zone create/edit/delete rates (name, price, optional
minimum order value for free-shipping-over-X-style rules). The same amber "not yet wired to
checkout" warning banner from the earlier phase is preserved and still accurate.

## 3. Carrier settings (`/admin/settings/carriers`) + real fulfillment integration

A saved carrier list (CRUD: name + optional tracking URL template) now drives a real dropdown in
the order fulfillment form (`components/admin/fulfillment-form.tsx`), replacing the previous
free-text-only carrier field. Selecting a carrier auto-fills its name and, once a tracking number
is entered, substitutes it into the carrier's saved URL template in real time — while still
allowing a fully custom carrier/URL for anything not in the saved list. This is genuinely new
admin capability, not a cosmetic change: before this phase, an admin had to type a full tracking
URL by hand on every single fulfillment.

**Explicitly scoped out, and why**: no real carrier API integration (live rate lookup, label
purchasing, webhook tracking updates) exists or is claimed. That would require real carrier API
credentials (e.g. a PostNord Logistics API key) which have not been provided — this phase builds
everything possible without them and stops there, per the user's own instruction on external
services.

## 4. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including the new `/admin/settings/carriers`
  route and the expanded `/admin/settings/shipping` route.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **14/14 checks passed** — the shipping page shows
  the real migrated zone/rate (Sverige/Standardfrakt/0 kr — "Fri frakt"); creating a new zone and a
  new rate within it both persist correctly to the database with the right values; deleting the
  rate and then the zone through the real UI (including correctly handling the native confirm()
  dialog each delete uses) removes them from the database; the carriers page shows the 2 real
  seeded carriers; creating a new carrier persists its tracking URL template correctly; on a real
  existing unfulfilled order, selecting "PostNord" from the fulfillment form's carrier dropdown and
  entering a tracking number correctly auto-fills a real PostNord tracking URL with that number
  substituted in — **the fulfillment itself was never submitted**, so no real order's state was
  touched by this check.
- Two real bugs were found and fixed in the **test harness** during verification (not the
  product): the test initially forgot to register a dialog handler before clicking a delete button
  that calls `confirm()`, so Playwright's default auto-dismiss silently no-op'd the delete (fixed
  with a persistent `page.on("dialog", ...)` handler); and a too-short 1-second wait before
  checking the database after a UI action was occasionally too tight, fixed by extending it.
- A design detail worth recording and avoided correctly: `buildTrackingUrl()` is a pure,
  no-database helper now split into its own small universal module
  (`lib/shipping/tracking-url.ts`) specifically so the client-side fulfillment form can import it
  without pulling in the server-only-guarded `lib/admin/shipping-carriers.ts` module (which throws
  if ever imported into client code) — confirmed via a clean build with no runtime guard tripped.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`,
  `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte
  unchanged. `git status` shows exactly 4 modified pre-existing files (the order detail page, the
  shipping settings action/page, and the fulfillment form) plus 2 deleted files (the old
  single-flat-rate lib/form, fully superseded); everything else is new.
- All disposable test data (a test admin account, a test zone/rate/carrier, verification scripts)
  was deleted after use; none of it is part of this commit.

## Known, deliberate scope cuts

No rule-based automatic rate selection yet implemented anywhere outside this admin UI (e.g.
"cheapest eligible rate wins") — that logic only matters once this is wired into checkout, which
remains a separate future step. No real carrier API integration (see §3). No zone-reordering drag
handle — zones are shown in creation order via their `position` column, editable later if ever
needed; not requested this round.

## Files touched

8 new files (2 migrations, `lib/admin/shipping-zones.ts`, `lib/admin/shipping-carriers.ts`,
`lib/shipping/tracking-url.ts`, the `/admin/settings/carriers` page + actions, and 2 new manager
components) plus 4 modified files (the order detail page, the shipping settings action + page, and
the fulfillment form) and 2 deleted files (the superseded flat-rate lib/form). Full list available
via `git status`.
