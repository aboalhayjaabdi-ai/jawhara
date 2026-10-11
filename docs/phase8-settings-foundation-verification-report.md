# Phase 8 verification report — settings foundation (admin completion, part 1)

Date: 2026-10-11. Branch: `claude/festive-pasteur-77mezq`.

## Scope

First of the admin-completion phases: store/business settings (name, support contact, address,
VAT, logo), DB-driven URL redirect management (replacing the single hardcoded `next.config.mjs`
entry with a real admin-editable system), and a standalone, filterable audit-log viewer. Every
standing constraint was preserved: the live Shopify store was never touched, the production
domain/DNS was never touched, and `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`,
and `lib/discounts.ts`'s calculation logic are confirmed byte-for-byte unchanged (see **Diff
review** below).

## 1. Database migration

**`0022_settings_redirects.sql`** — seeds `store_settings` with real starting values
(`business_name: "Jawhara"`, `support_email: "support@jawhara.se"` — the already-corrected real
address from the Phase 4 content fix, `support_phone`/`business_address` empty, `logo_url: null`),
`on conflict do nothing` so the pre-existing `vat_rate_percent` row is untouched. New
`url_redirects` table (`source_path` unique, `destination_path`, `created_by`), public-read +
admin-write RLS — the public-read policy is what lets `middleware.ts` look up redirects without
authentication, mirroring the already-established pattern for `storefront_menus`.

## 2. Store settings

`/admin/settings`: business name, support email/phone, business address, a logo upload (reusing
the existing `product-media` Storage bucket under a new `branding/` path, with the existing
`ImageUploadField` component generalized to accept a configurable upload endpoint rather than a
hardcoded one), and the VAT rate. **Confirmed real, not cosmetic**: `lib/discounts.ts`'s
`getVatRatePercent()` already reads this exact `store_settings` row at checkout time (built in an
earlier phase) — this UI is the first real way to change it without raw SQL. Currency is shown as
a fixed, informational "SEK" line rather than a fake editable dropdown, since checkout has no
architecture to support anything else — explicitly not inventing functionality that doesn't exist
underneath.

The logo override flows through `app/(storefront)/layout.tsx` (now also fetching
`getLogoUrl()` alongside the existing `getSiteMenus()` call) into `<Header logoUrl>`, which falls
back to the original static `/brand/logo.png` whenever no override is set — confirmed live: the
real homepage still renders the original logo correctly with no override configured.

## 3. DB-driven redirects

`/admin/settings/redirects`: add/delete, each entry validated (no duplicate source, can't target
`/admin` or `/api`). The actual redirect-serving mechanism required a real middleware change:
`middleware.ts` previously only ever ran on `/admin/:path*`. It now runs on effectively every
non-API, non-`_next`, non-favicon route; for any path *not* under `/admin`, it skips the existing
admin-auth logic entirely, skips static-asset paths (anything with a file extension) without a
database call, and otherwise does one unauthenticated, RLS-public-read lookup against
`url_redirects`, issuing a `308` on a match. The existing `/admin` auth flow (the three-layer
defense-in-depth already documented in the file) is untouched — refactored into its own function,
not rewritten.

**Critical bug found during Playwright verification, fixed before completion**: the redirects list
component originally relied on `router.refresh()` after creating a new redirect, but a Client
Component's own `useState` doesn't automatically re-sync when a Server Component ancestor
re-renders with new props — the newly created redirect would never appear in the list without a
full manual reload, even though the database write itself succeeded. Fixed by having
`createRedirect` return the created row and having the component append it to local state directly
(the same optimistic-update pattern already used correctly elsewhere, e.g.
`components/admin/menu-item-list.tsx`). Re-verified afterward: create → appears immediately →
visiting the new path actually redirects (308) → delete removes it from the list immediately.

## 4. Standalone audit log

`/admin/audit-log`: every admin mutation across every module, filterable by action text, entity
type (14 real types currently in use, enumerated directly from every `logAdminAction` call site in
the codebase), and date range. `admin_users` has no email column (confirmed again — it lives on
`auth.users`), so `lib/admin/audit-log.ts` resolves actor identity via the Supabase Auth admin API
(`listUsers()`), the first page in this project to actually show *who* performed an action rather
than only *what* happened (the existing per-order/per-customer activity timelines deliberately
don't show this).

## 5. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including all new routes. One transient
  `MODULE_NOT_FOUND`/stale-port failure during local verification was confirmed to be a leftover
  dev-server process on port 3000 from an earlier session colliding with a fresh `.next` build —
  not a code defect; killing the stray process and rebuilding resolved it immediately, confirmed by
  a clean second build.
- **Middleware smoke test** (the highest-risk change this phase, since it affects every storefront
  route): confirmed homepage, a product page, `sitemap.xml`, and a static asset (`/brand/logo.png`)
  all still return 200, and the admin-auth redirect (307 for an unauthenticated `/admin` request)
  still works correctly, *before* building anything on top of it.
- **Direct functional test** (disposable rows, cleaned up after): `store_settings` write/read
  round-trip confirmed, then the real value restored and re-confirmed; VAT setting confirmed
  unaffected; RLS proven directly (the public anon client can read but not write
  `url_redirects`, the service/admin client can write); a real redirect was created and found to
  genuinely 308-redirect via a direct `curl`, then cleaned up.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **13/13 checks passed** (after the fix above) —
  login; settings page loads with the real business name prefilled; edit and save a setting;
  confirm it persisted after a reload; restore the real value; confirm the homepage logo still
  renders correctly with no override; create a redirect and confirm it appears immediately; confirm
  it actually redirects; delete it and confirm it's gone; the audit log shows real entries
  including this session's own `settings.update` actions; the entity-type filter correctly isolates
  `url_redirect` entries.
- **Final database check**: `store_settings` confirmed to exactly match its pre-test state
  (business name, support email, VAT all real and unchanged), `url_redirects` confirmed empty.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`, `app/api/webhooks/stripe/
  route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte unchanged. `git status`
  shows exactly 6 modified pre-existing files (`app/(storefront)/layout.tsx`, `admin-nav.ts`,
  `image-upload-field.tsx`'s endpoint generalization, `header.tsx`, `lib/queries.ts`,
  `middleware.ts`); everything else is new.
- All disposable test data (settings edits, test redirects, the test admin account, ad-hoc
  verification/cleanup scripts) was deleted/restored after use; none of it is part of this commit.

## Known, deliberate scope cuts

No multi-currency support (currency is informational-only, SEK, since checkout has no real
architecture for anything else — building a selector would be fake functionality). No redirect
wildcard/regex matching — exact path match only, matching the actual real-world use case (a single
handful of old-URL redirects), not an open-ended rules engine. No audit-log row-level drill-down
beyond the existing summarized `detail` column — a dedicated single-entry detail view was judged
unnecessary at this data volume.

## Files touched

9 new files (the migration, `lib/admin/store-settings.ts`, `lib/admin/audit-log.ts`, the settings/
redirects/audit-log admin pages+actions, and 3 new components) plus 6 modified files
(`app/(storefront)/layout.tsx`, `components/admin/admin-nav.ts`,
`components/admin/image-upload-field.tsx`, `components/layout/header.tsx`, `lib/queries.ts`,
`middleware.ts`). Full list available via `git status`.
