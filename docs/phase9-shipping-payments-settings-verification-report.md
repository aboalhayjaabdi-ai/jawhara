# Phase 9 verification report — shipping & payments settings (admin completion, part 2)

Date: 2026-10-12. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Second of the admin-completion phases: a real, persisted shipping-settings page (allowed countries
+ flat rate) and a payments settings page showing live Stripe connection status plus the real
`payments` transaction history. Every standing constraint was preserved: the live Shopify store was
never touched, the production domain/DNS was never touched, no real payment or refund was ever
initiated, and `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, and
`lib/discounts.ts`'s calculation logic are confirmed byte-for-byte unchanged (see **Diff review**
below).

## 1. Database migration

**`0023_shipping_settings.sql`** — seeds `store_settings` with `shipping_allowed_countries:
["SE"]` and `shipping_flat_rate: 0`, `on conflict do nothing` so nothing pre-existing is touched.
Both values exactly match checkout's real, current hardcoded behavior (Sweden-only, free
shipping) — nothing changes about what a customer is charged today.

## 2. Shipping settings — real, persisted, but explicitly not yet wired into checkout

`/admin/settings/shipping`: edits the allowed-country list (validated as 2-letter ISO codes) and
the flat rate, writing both rows for real via `updateShippingSettings` (`requireAdmin()` →
`supabaseService` write → `logAdminAction("settings.update_shipping", ...)`).

**Deliberate, explicitly-flagged limitation**: per the standing hard constraint never to edit
`app/api/checkout/route.ts` without a separate, explicit go-ahead (checkout today has shipping
hardcoded to SE-only/free, not read from any settings table), this phase stops short of wiring
these new settings into the live checkout calculation. The page carries an amber banner saying so
in plain Swedish, and this report states it again directly: **changing these values today does
not change what a customer is charged** — it only changes what's stored. Wiring it in for real is
a one-line follow-up in the protected checkout file, available whenever explicitly requested.

## 3. Payments settings — real Stripe connection + real transaction history

`/admin/settings/payments`: two status tiles (live Stripe account connection — read-only
`stripe.accounts.retrieve()`, no write/charge capability of any kind; and checkout's own
enabled/disabled flag, read directly from `NEXT_PUBLIC_CHECKOUT_ENABLED`, display-only, never a
toggle) plus a paginated table over the real `payments` table joined to `orders` for order-number
links.

**Confirmed real data, not mocked**: the Stripe call returned a genuine live-mode account
(`JAWHARA`, `aboalhayja.aboodahya@gmail.com`, country `SE`, default currency `EUR`); the payments
table has 474 real rows.

## 4. Settings sub-nav

`/admin/settings` now links to Frakt and Betalningar alongside the existing Omdirigeringar and
Aktivitetslogg links.

## 5. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including the two new routes
  (`/admin/settings/shipping`, `/admin/settings/payments`).
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **10/10 checks passed** — login; the shipping page
  loads with the amber "not wired to checkout" banner and the real prefilled default value;
  edit/save/persist-after-reload; restore the real default; a direct `POST /api/checkout` request
  still responds exactly as before (403, proving the checkout route itself was completely
  unaffected by this phase's changes); the payments page shows the real Stripe connection tile and
  the real 474-row payments table.
- **Final database check**: `store_settings`'s two new rows confirmed restored to their real
  defaults after the test (`shipping_allowed_countries: ["SE"]`, `shipping_flat_rate: 0`) — exactly
  matching checkout's actual live behavior.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`,
  `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte
  unchanged. `git status` shows exactly one modified pre-existing file
  (`app/admin/(authenticated)/settings/page.tsx`, the sub-nav links); everything else is new.
- All disposable test data (settings edits, the test admin account, ad-hoc verification/cleanup
  scripts) was deleted/restored after use; none of it is part of this commit.

## Known, deliberate scope cuts

Shipping settings are stored but not yet consumed by checkout (see §2 — requires a separate,
explicit go-ahead to touch the protected checkout file). No shipping *zones* (multiple rates per
region) — a single flat rate + country allow-list matches the real current single-rate model, not
an invented multi-zone system. No refund-initiation UI on the payments page — Phase 2's order
detail page already owns refunds with the correct Shopify-vs-Stripe origin guard; duplicating that
here would be redundant and risk drifting out of sync with that guard.

## Files touched

7 new files (the migration, `lib/admin/shipping-settings.ts`, `lib/admin/payments-status.ts`, the
shipping/payments admin pages + actions + form component) plus 1 modified file
(`app/admin/(authenticated)/settings/page.tsx`). Full list available via `git status`.
