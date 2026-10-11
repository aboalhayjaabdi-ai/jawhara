-- Phase 4: customer management schema.

-- customers: origin label, mirrors orders/products/collections.source. GDPR lifecycle timestamps.
alter table customers add column source text;
update customers set source = case when shopify_id is not null then 'shopify' else 'manual' end;
alter table customers alter column source set not null;
alter table customers add constraint customers_source_check check (source in ('shopify', 'manual'));
alter table customers add column anonymized_at timestamptz;
alter table customers add column deletion_requested_at timestamptz;

-- customers: RLS only ever had "own row" (select) and "own row update" (update) -- no insert/delete
-- policy existed at all, so admin writes already had to go through supabaseService (confirmed
-- precedent for every admin write in this project). Add explicit admin coverage for defense-in-depth
-- parity with every other admin-managed table ("admin write" alongside a "public"/"own" read policy).
create policy "admin write" on customers for all using (is_admin());

-- admin_users: the roadmap's stated design intent (role column exists, unused) becomes real --
-- gates a handful of sensitive customer actions (hard delete, anonymize, GDPR export, bulk export)
-- to role='admin' in application code. The single existing row is already 'admin', so this is a
-- pure constraint addition with no behavior change until a 'staff' row is ever created (there is
-- still no staff-invitation UI in this project -- that remains a direct database edit, exactly
-- like admin_users itself works today).
alter table admin_users add constraint admin_users_role_check check (role in ('admin', 'staff'));

-- Saved views / segments: one mechanism serves both "saved customer views" (requirement #1) and
-- "customer groups based on purchase behavior/location/spending/frequency" (requirement #4) --
-- a segment IS a saved view with specific filter criteria. Shared across all admins (same
-- visibility model as every other admin resource in this project), not per-admin-private.
create table customer_saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null default '{}',
  created_by uuid references admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table customer_saved_views enable row level security;
create policy "admin only" on customer_saved_views for all using (is_admin());

-- Shared order-stats aggregation, read by both the customer list (sort/filter by spend/order
-- count/last order) and the customer profile (LTV/AOV) -- one definition so the two can never
-- disagree, same principle as Phase 3's getLowStockVariants.
--
-- Two real data quirks this must account for (confirmed via investigation, not assumed):
-- 1. orders.financial_status is free text with no CHECK constraint. Live Stripe/manual code writes
--    lowercase ('paid'); Shopify-imported/synced orders store Shopify's own uppercase values
--    ('PAID', 'PARTIALLY_REFUNDED'). Matched case-insensitively below.
-- 2. No live code path ever sets orders.customer_id for a Stripe or manual order -- every
--    post-migration order is a guest order by customer_id alone. Real per-customer spend must also
--    catch these via a same-email fallback (only when orders.customer_id is null, so a Shopify
--    order already correctly attributed by id is never double-counted via email too).
-- "Paid" here means "represents real revenue, not fully refunded": paid or partially_refunded.
-- Cancelled orders are always excluded.
create or replace view customer_order_stats
with (security_invoker = true) as
select
  c.id as customer_id,
  count(o.id)::int as order_count,
  coalesce(sum(o.total_price), 0)::numeric(12, 2) as total_spent,
  max(o.created_at) as last_order_at
from customers c
left join orders o
  on o.cancelled_at is null
  and lower(o.financial_status) in ('paid', 'partially_refunded')
  and (
    o.customer_id = c.id
    or (o.customer_id is null and o.email is not null and c.email is not null and lower(o.email) = lower(c.email))
  )
group by c.id;

-- GDPR data-subject requests: a dedicated, easy-to-report-on audit trail for export/deletion
-- requests, distinct from the generic audit_log (whose jsonb detail would otherwise bury these
-- legally significant events). 'restricted' records a deletion request that could not be fully
-- honored (real paid order history exists, retained for statutory accounting purposes) and was
-- substituted with anonymization instead -- itself a GDPR accountability best practice.
create table customer_data_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  kind text not null check (kind in ('export', 'deletion')),
  status text not null check (status in ('completed', 'restricted')),
  reason text,
  requested_by uuid references admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table customer_data_requests enable row level security;
create policy "admin only" on customer_data_requests for all using (is_admin());
