# Phase 4 verification report — complete customer management

Date: 2026-10-11. Branch: `claude/festive-pasteur-77mezq`.

## Scope

A full Shopify-Admin-depth customer management system: directory with search/filter/sort/
pagination/saved views, detailed profiles with contact info, addresses, order history, LTV/AOV,
notes/tags/segments, marketing consent management, create/edit, CSV import/export with
duplicate-safe preview, an activity timeline, GDPR export/anonymization/deletion with legally
required accounting-record restrictions, role-gated server-side authorization + audit logging, and
bulk operations — all against real Supabase data, on the existing Shopify-inspired admin design.
Every standing constraint was preserved: the live Shopify store was never written to, the
production domain/DNS was never touched, and `app/api/checkout`, `app/api/webhooks/stripe`, and
`lib/discounts.ts` are confirmed byte-for-byte unchanged (see **Diff review** below), as are every
Phase 1–3 products/collections/orders/inventory surface.

## 1. Ground-truth research before building anything

Before writing code, a dedicated research pass read every migration touching
`customers`/`addresses`/`orders`/`admin_users`/`audit_log`, every existing admin-table/filter
convention, and every GDPR reference already in the repo. Two load-bearing facts that shaped the
whole design, confirmed directly rather than assumed:

- **No live code path ever sets `orders.customer_id` for a Stripe or manual order** — only
  Shopify-imported/synced orders get it. Every post-migration order is a guest order by
  `customer_id` alone. Real per-customer order history, spend, and LTV must therefore match by
  `customer_id` **or** same-email fallback for guest orders — never `customer_id` alone, or almost
  every post-migration order would be invisible on a customer's profile.
- **`orders.financial_status` is free text with no CHECK constraint**, and genuinely
  case-inconsistent in real data: live Stripe/manual code writes lowercase (`'paid'`); Shopify-
  imported/synced orders store Shopify's own uppercase values (`'PAID'`, `'PARTIALLY_REFUNDED'`).
  Every aggregation in this phase matches case-insensitively.

## 2. Database migrations

- **`0016_phase4_customer_management.sql`** — `customers.source` (mirrors orders/products/
  collections), `customers.anonymized_at`/`deletion_requested_at`; an `admin_users.role` CHECK
  constraint (`'admin'`/`'staff'`) turning the roadmap's long-unused role column into a real,
  enforceable value; a new `customer_saved_views` table; a new `customer_order_stats` view
  (`security_invoker`) that is the single source of truth for order count/total spent/last order
  date, correctly handling both quirks above; a new `customer_data_requests` table (GDPR audit
  trail); an explicit admin-write RLS policy on `customers` (it previously had only SELECT/UPDATE
  policies at all — no INSERT or DELETE policy existed, so admin writes already had to go through
  the service-role client, same as every other admin write in this project; this adds
  defense-in-depth parity with every other admin-managed table).
- **`0017_fix_customer_data_requests_fk.sql`** — see **Issue found and fixed during
  implementation** below.

## 3. Critical issue found and fixed during implementation

`customer_data_requests.customer_id` was defined in 0016 as `references customers(id) on delete
cascade`. The entire purpose of that table is to durably record that a deletion request happened —
including for a customer who was then actually, fully deleted. With `ON DELETE CASCADE`, the
instant `deleteCustomerAction`'s hard delete ran, Postgres would have immediately deleted the very
audit row recording that it ran, silently destroying the GDPR accountability record the table
exists to keep. Caught before this ever reached a real user action (while wiring the Server Action
logic, not during the later test pass), fixed with `0017`: the constraint is now `ON DELETE SET
NULL` (`customer_id` made nullable), and the action now inserts the request row **before** deleting
the customer. Verified directly: a hard delete now leaves a `completed` request row behind with
`customer_id = null`, rather than losing it.

## 4. Customer directory

`/admin/customers`: search, country/marketing-consent/no-orders/spend-range/order-count filters,
sort (name, created, total spent, order count, last order), pagination, bulk-select with tag add/
remove, marketing-consent set, and delete (eligibility-checked per row — never anonymizes on the
caller's behalf). CSV export and "Ny kund" in the toolbar.

**Scale-proportionate architecture, not the per-entity DB-query-builder pattern used for orders/
products**: at ~500 customers (growing slowly), the list page loads every customer joined with
`customer_order_stats` and default-address country in one shot and filters/sorts/paginates in
application code — simpler and more honest than a dual DB-paginated/fetch-all code path, since
there is no pre-existing default behavior here to risk regressing (this is brand new). The same
`listCustomersWithStats`/`applyCustomersListFilters` pair backs the list page, CSV export, and
saved-view evaluation, so none of the three can ever disagree on the numbers.

**Saved views and segments are one mechanism, not two**: a "customer segment based on purchase
behavior/location/spending/frequency" is, structurally, a saved view whose filters happen to be
stat-based. `customer_saved_views` stores a name + the exact same filter-params shape the URL
itself uses, shared across all admins (same visibility model as every other admin resource in this
project). A handful of quick-segment buttons (no orders, 2+ orders, 1000kr+, accepts marketing) are
client-side filter shortcuts only — never persisted as fake rows.

## 5. Customer profile

`/admin/customers/[id]`: stat tiles (order count, total spent, AOV, last order — all computed live
from `customer_order_stats`, never a stored/stale column); editable contact info, note, and tags;
a full address book (add/edit/delete/set-default); real order history (matched the same
customer_id-or-email way as the stats view, so the two can never disagree); a merged activity
timeline (the customer's own `audit_log` entries plus the lifecycle events of their real orders);
marketing consent (toggle bumps `marketing_consent_updated_at`, same real-world behavior Shopify
itself tracks) cross-referenced against the separate, previously-unreconciled `newsletter_
subscribers` list; and the GDPR actions card.

## 6. GDPR

- **Export** (`/api/admin/customers/[id]/export-data`, role-gated to `admin`): assembles the
  customer's own profile, address book, and full order history as a downloadable JSON file — the
  subject-access-request deliverable. Logs a `customer_data_requests` row.
- **Anonymize** (role-gated, typed-confirmation UI): always scrubs the customer's own
  identifying fields (name/email/phone/note/tags) and their personal address book, but **never**
  an order-linked address (that belongs to a specific transaction's financial record, not the
  customer's identity profile) and never the orders/payments rows themselves. Logs `status:
  'restricted'` when the customer had real orders (full erasure wasn't legally possible, PII
  scrubbing is the actual outcome) or `'completed'` when they had none (anonymization still fully
  achieves erasure).
- **Delete** (role-gated, typed-confirmation UI): hard delete, structurally refused whenever
  `order_count > 0` — "appropriate restrictions for legally required accounting records" is
  enforced in code, not left to admin judgment, and the UI doesn't even show the delete option when
  the customer has orders (only Anonymize does).
- **Role gating**: `requireAdmin()` now also returns the caller's `admin_users.role`; a new
  `requireRole()` helper gates export/anonymize/delete to `role === 'admin'`. There is still no
  staff-invitation UI anywhere in this project (confirmed, and intentionally out of scope for this
  phase — the single existing admin account is already `role: 'admin'`), so this has no visible
  effect today; it is the structural enforcement point the project's own roadmap called for,
  exercised the moment a `'staff'` row is ever created.

## 7. CSV import/export

Export: one row per customer (email, name, phone, consent, tags, note, source, order count/total
spent, and the default address's fields). Import: the same parse → diff-preview → commit shape
Phase 3 established for products, reusing its generic parser (extracted into
`lib/admin/csv/parse.ts` once a second real entity needed it, rather than duplicated). Natural
dedup key is **email, case-insensitively** — a **soft** match, not a DB unique constraint, since
`customers.email` has no uniqueness guarantee in the real migrated data (same reasoning as Phase
3's `product_templates.key`). A row with no email can never be matched and always creates a new
customer. Blank cells always mean "leave unchanged" on update, never "clear to empty."

## 8. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean after every sub-area and on the final combined
  pass.
- **Direct functional tests** (disposable rows, cleaned up after): anonymize-with-real-orders
  correctly scrubs PII while preserving the order's `customer_id` link and total; the
  `customer_data_requests` row survives a hard delete with `customer_id` set to `null` (the FK fix,
  re-verified after applying it); the GDPR export assembles the right profile/address/order data;
  the CSV import round-trip creates a new customer with a default address from the file, then a
  second import with a different-case email updates the *same* customer (no duplicate) while
  leaving blank-celled fields untouched. 15/15 checks passed.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward, with every test customer/saved-view it created also
  deleted): 19/19 checks passed — login; directory loads; create a customer; profile renders with
  all sections; save note/tags; toggle marketing consent; add an address; the merged activity
  timeline shows the real actions just taken; search filter finds the customer; save and reload a
  saved view; a quick-segment button applies via the URL; the CSV import wizard page loads; the
  GDPR export link is present; a bulk tag-add action runs and is reflected on the row; anonymize
  runs through its typed-confirmation flow and the profile shows the "Anonymiserad" badge; an
  existing order's detail page renders its (now customer-profile-linked) Kund card; and a live,
  **unedited** storefront product page still renders correctly.
- **Diff review**: `git status`/`git diff` against the pre-Phase-4 state confirm `app/api/
  checkout`, `app/api/webhooks`, `lib/discounts.ts`, and every Phase 1–3 products/collections/
  orders/inventory file are untouched. Exactly 4 pre-existing files were modified (the order
  detail page's Kund-card link, `admin-nav.ts`, `lib/admin/auth.ts`'s role extension, and the CSV
  parser extraction) — everything else is new.
- All disposable test data (customers, saved views, the test admin account, ad-hoc verification
  scripts) was deleted/removed after use; none of it is part of this commit.

## Known, deliberate scope cuts

No staff-invitation/role-assignment UI (the role-gating enforcement point exists; creating a
`'staff'` account is still a direct database edit, exactly like creating any `admin_users` row is
today — a dedicated staff-management UI remains out of scope for this phase, same as the original
roadmap's own "Settings/staff/security" being a distinct later phase). Anonymization does not touch
`auth.users`/`auth_user_id` — a customer with a real storefront login keeps the ability to sign in
after anonymization, just to a now-blank profile; full auth-account erasure was not explicitly
requested and is flagged here rather than silently handled. `newsletter_subscribers` is
cross-referenced on the profile page for visibility but deliberately not merged into
`customers.accepts_marketing` — they remain the two independent signals they already were.

## Files touched

22 new files (migrations, `lib/admin/customer-stats.ts`, `lib/admin/customers-filters.ts`,
`lib/admin/gdpr.ts`, `lib/admin/csv/customers-import.ts`, `lib/admin/csv/parse.ts`, the customers
admin pages/actions/API routes, and 10 new components) plus 4 modified files (`lib/admin/auth.ts`,
`components/admin/admin-nav.ts`, `lib/admin/csv/products-import.ts`, and the order detail page's
customer link). Full list available via `git status`.
