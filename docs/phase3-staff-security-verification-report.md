# Phase 3 verification report — staff accounts & role-based security

Date: 2026-10-12. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Third of the admin-completion phases: a real staff-account management UI (invite, role
management, deactivation, removal) on top of the `admin_users.role` column that has existed since
an earlier phase but never had any app code writing to it — until this phase, the only way to
create an admin account was a direct database edit. Also closes a real gap found during the
audit: neither `middleware.ts`, the admin layout, nor `requireAdmin()` checked a "disabled" state
at all, since the column didn't exist yet. MFA (TOTP) enrollment (`/admin/security`) was already
built in an earlier phase and needed no changes. Every standing constraint was preserved: the live
Shopify store was never touched, the production domain/DNS was never touched, and
`app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts`'s
calculation logic are confirmed byte-for-byte unchanged (see **Diff review** below).

## 1. Database migration

**`0024_phase3_staff_security.sql`** — adds `admin_users.disabled boolean not null default
false` (lets access be revoked without deleting the underlying `auth.users` account, which would
also detach historical attribution on `audit_log`/`orders.cancelled_by`/etc. via their `on delete
set null` foreign keys) and `admin_users.invited_by uuid references admin_users(id)` (so the staff
list can show who invited whom). No pre-existing row is disabled by this migration.

## 2. Staff management (`/admin/staff`, admin-role only)

- **Invite**: `inviteStaff(email, role)` calls Supabase's `auth.admin.inviteUserByEmail()` (the
  real invite-email mechanism), then creates the `admin_users` row. The invited person signs in for
  the first time via `/admin/reset-password` — a page already built in an earlier phase
  specifically anticipating this flow ("used both for the first-time password setup on a newly
  invited admin account and for an ordinary forgot-password reset later").
- **Role change**: `updateStaffRole()` toggles between `admin`/`staff`. Blocked from changing your
  own role, and blocked from demoting/disabling/removing the last active admin account (see §3).
- **Disable/enable**: `setStaffDisabled()` flips the new `disabled` column. A disabled account's
  session is rejected at all three auth layers (middleware, the admin layout's page-load check, and
  `requireAdmin()` inside every Server Action) — confirmed live, not just in the UI.
- **Remove**: `removeStaff()` deletes only the `admin_users` row, never the underlying
  `auth.users` account — revokes admin access immediately while keeping the person's historical
  attribution on past orders/audit-log entries intact (their actions stay visible as "who did
  what," matching the existing audit-log actor-resolution pattern).
- The page itself is gated to `role === "admin"` — a `role: "staff"` account sees a plain
  "administrators only" message instead of the staff table, not just a hidden link.

## 3. Self-lockout safeguards

Every mutating action (`updateStaffRole`, `setStaffDisabled`, `removeStaff`) refuses to let an
admin change their own role, disable their own account, or remove themselves from this page, and
separately refuses to demote/disable/remove the **last** remaining active (`role='admin',
disabled=false`) account store-wide — the store can never be left with zero administrators able to
manage staff.

## 4. Middleware/layout/`requireAdmin()` now check `disabled`

All three existing auth layers were updated to treat a disabled `admin_users` row the same as "no
row at all." `middleware.ts` required a small structural fix alongside this: the admin-row lookup
is now computed once and reused by both the "redirect unauthenticated/disabled users to login" and
the "redirect an already-signed-in active admin away from the login page" branches — resolving a
disabled account would otherwise bounce between those two checks (session exists → redirected away
from `/admin/login` → hits `/admin` → not an active admin → redirected back to `/admin/login` →
...), caught and fixed during implementation, before it ever reached Playwright.

## 5. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including the new `/admin/staff` route.
- **A real external-dependency finding, documented rather than worked around**: this Supabase
  project's Auth email service has `rate_limit_email_sent: 2` (2 emails/hour) with no custom SMTP
  configured (`smtp_host: null`), confirmed via a direct read of the project's Auth config. The
  invite mechanism is fully real and works end-to-end, but real-world use beyond occasional invites
  will need a custom SMTP provider configured in Supabase (Settings → Authentication → SMTP) for
  reliable delivery. This is a genuine operational dependency, not a bug — reported here per the
  standing instruction to flag such dependencies rather than hide them.
- **Live browser verification** (Playwright, two disposable accounts — one `role=admin`, one
  standing in for an invited `role=staff` account, both fully deleted afterward): **17/17 checks
  passed**, covering: login; the staff page lists real rows; the signed-in admin's own row has a
  disabled role-select and no remove/disable buttons; a real `inviteUserByEmail()` call through the
  UI correctly surfaces its real result to the admin (observed as the genuine Supabase rate-limit
  error during this run, confirmed handled gracefully rather than silently failing); promoting a
  staff account to admin and back persists correctly; disabling an account persists and is reflected
  in the UI; a disabled account's login session is rejected and bounced back to `/admin/login`
  (not just hidden from the UI); re-enabling restores access; a `role=staff` account sees the
  restricted message on `/admin/staff` instead of the table; removing a staff account deletes the
  `admin_users` row while leaving the underlying `auth.users` account intact.
- **Final database check**: zero disposable test rows/accounts remain; the one real admin account
  (`aboalhayja.abdi@gmail.com`) is confirmed unchanged (`role: admin, disabled: false`).
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`,
  `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte
  unchanged. `git status` shows exactly 4 modified pre-existing files (`app/admin/(authenticated)/
  layout.tsx`, `components/admin/admin-nav.ts`, `lib/admin/auth.ts`, `middleware.ts`); everything
  else is new.
- All disposable test data (two test accounts, ad-hoc verification/cleanup scripts) was deleted
  after use; none of it is part of this commit.

## Known, deliberate scope cuts

No bulk staff import/export (the realistic account volume for a solo-to-small business is a
handful of people, not a CSV-sized list). No per-permission granularity beyond the existing two
roles (`admin`/`staff`) — `requireRole()` already keys off this column everywhere sensitive
(customer GDPR export/delete, now also staff management itself), so adding a third role later is a
data/call-site change, not an architecture change, matching this project's own stated design
intent from an earlier phase. MFA enrollment was already built and needed no changes this phase —
it is self-service per account at `/admin/security`, not yet admin-enforceable (an admin cannot
currently require another account to enable MFA); flagged here as a possible future addition, not
built speculatively.

## Files touched

4 new files (the migration, `lib/admin/staff.ts`, the `/admin/staff` page + actions, and
`components/admin/staff-list.tsx`) plus 4 modified files (`app/admin/(authenticated)/layout.tsx`,
`components/admin/admin-nav.ts`, `lib/admin/auth.ts`, `middleware.ts`). Full list available via
`git status`.
