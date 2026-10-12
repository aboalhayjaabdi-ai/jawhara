# Phase 5 verification report — email template editor

Date: 2026-10-12. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Fifth of the admin-completion phases, per the user's explicit priority list: a real editor for the
3 transactional emails this project already sends (order confirmation, shipping confirmation,
refund notification), with previews, editable Swedish copy, a real test-send, and safe
draft/publish separation so an in-progress edit can never reach a real customer. Every standing
constraint was preserved: the live Shopify store was never touched, the production domain/DNS was
never touched, no real customer ever received a test email, and `app/api/checkout/route.ts`,
`app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts`'s calculation logic are confirmed
byte-for-byte unchanged (see **Diff review** below).

## 1. Database migrations

**`0027_phase5_email_templates.sql`** — new `email_templates` table, admin-only RLS. Draft/live
column split (`subject`/`heading`/`intro_html`/`outro_html` for the published version;
`draft_*` equivalents for in-progress edits), mirroring the same pattern already proven for the
homepage editor (`storefront_layouts`, Phase 7): a draft can be edited and previewed freely, and
never affects a real customer email until an explicit "Publicera" action copies it into the live
columns. Deliberately, only the genuinely editable prose is stored here — order number, line
items, totals, shipping address, and tracking info stay structured, data-driven renders in
`lib/email/templates.ts`, never free text, so an admin edit can never corrupt a real order's
numbers.

**`0028_phase5_email_templates_seed.sql`** — seeds the exact 3 real templates with the copy
already live in `lib/email/templates.ts` before this phase (draft and live start identical, so
nothing about a real customer email changes until an admin edits and publishes).

## 2. Read/send path

`lib/email/templates.ts`'s three template-builder functions (`orderConfirmationTemplate`,
`shippingConfirmationTemplate`, `refundNotificationTemplate`) now take the editable content as an
explicit parameter instead of hardcoding it, keeping the file's existing stated design contract
("pure template builders — no sending, no database access"). The three real send wrappers
(`lib/email/order-confirmation.ts`, `shipping-confirmation.ts`, `refund-notification.ts`) —
already the integration points called from the Stripe webhook and the order fulfillment/refund
actions — now fetch the **published** content via `getLiveEmailTemplate()` before rendering. A
draft edit is structurally invisible to this path; only `publishEmailTemplate()` can change what a
real customer receives.

## 3. Admin UI (`/admin/email-templates`)

A list page shows all 3 templates with a "Publicerad"/"Opublicerade ändringar" status badge and
last-published timestamp. Each opens a two-column editor: the left side edits subject (must
contain the `{{orderNumber}}` placeholder, validated), heading, and the intro/outro prose via the
existing shared `RichTextEditor` (Tiptap, already built in an earlier phase — reused, not
rebuilt); the right side is a live preview iframe (rendered with realistic synthetic sample order
data, never a real order) with a Utkast/Publicerad toggle so an admin can compare the draft against
what customers currently receive.

Four actions, each `requireAdmin()` → write → `logAdminAction()` → `revalidatePath()`:
- **Spara utkast** — saves the draft only.
- **Publicera** — saves the draft, then copies it into the live columns (what
  `getLiveEmailTemplate()` reads).
- **Återställ utkast** — discards unpublished changes back to the live version.
- **Skicka testmejl till mig** — saves the draft, then sends a real email via the real Resend send
  path, but *only ever* to the signed-in admin's own address, with synthetic sample data and a
  `[TEST]` subject prefix — never a real customer, never real order data.

## 4. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including the new `/admin/email-templates` routes
  and the preview API route.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **17/17 checks passed** — the list shows all 3 real
  templates, all starting with no unpublished changes; the editor is prefilled with the real
  seeded subject/heading/intro; editing and saving a draft updates only the draft columns in the
  database (live columns untouched); the list page's unpublished-changes badge updates
  accordingly; the draft preview shows the edit and real sample order data (order number, line
  items, totals), while the live preview correctly does *not* show it; a real test email send
  succeeds via the real Resend API and is correctly logged to `audit_log` with the admin's own
  address as the recipient; publishing copies the draft into the live columns, confirmed both via
  direct database read and by confirming the real send-path function (`getLiveEmailTemplate`)
  picks up the change; the template was then restored to its exact original content through the
  real admin UI (not a raw database write) and re-published, confirmed byte-for-byte identical to
  the original seed.
- Two real bugs were found and fixed in the **test harness** during verification (not the
  product): Playwright's `input` selector was initially ambiguous because the admin topbar's
  global search field sits before the editor's own fields in the DOM — fixed by scoping to
  `main input`; and a plain Node `fetch()` to the preview route carried no session cookies, so the
  (correctly) admin-gated route redirected it to the login page instead of returning the real
  preview — fixed by using Playwright's `page.request`, which shares the browser's authenticated
  session.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`,
  `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte
  unchanged. `git status` shows exactly 6 modified pre-existing files (`components/admin/
  admin-nav.ts`, `components/admin/audit-log-filter-bar.tsx`, and the three `lib/email/*.ts`
  wrapper files, plus `lib/email/templates.ts`); everything else is new.
- All disposable test data (the test admin account, verification/debug scripts) was deleted after
  use; none of it is part of this commit.

## Known, deliberate scope cuts

No create/delete of email templates — this editor manages the fixed set of 3 real transactional
emails this project actually sends, matching the content-pages editor's same scope decision in an
earlier phase. No arbitrary HTML editing of the structured sections (line items, totals, address,
tracking) — this is a deliberate safety boundary, not a missing feature: it is what makes "an
admin edit can never corrupt a real order's numbers" actually true rather than just asserted.

## Files touched

8 new files (2 migrations, `lib/admin/email-templates.ts`, `lib/email/sample-data.ts`, the
`/admin/email-templates` list + `[id]` edit pages + actions, the preview API route, and the editor
component) plus 6 modified files (`components/admin/admin-nav.ts`,
`components/admin/audit-log-filter-bar.tsx`, `lib/email/templates.ts`, and the three
`lib/email/*-confirmation.ts`/`refund-notification.ts` wrapper files). Full list available via
`git status`.
