-- Phase 5: Stripe-only commerce. Adds what the existing schema was missing for a real
-- Stripe-backed checkout: Stripe identifiers on orders/payments (the historical Shopify
-- import uses `shopify_id` as its upsert key, which doesn't exist for Stripe-created
-- orders), webhook idempotency, and real discount mechanics (re-pulled from Shopify's
-- Admin API on 2026-10-10 -- see the plan file for the full 6-discount summary table).

-- ---------------------------------------------------------------------
-- Stripe identifiers
-- ---------------------------------------------------------------------

alter table orders add column stripe_checkout_session_id text unique;
alter table payments add column stripe_checkout_session_id text unique;
alter table payments add column stripe_customer_id text;

-- ---------------------------------------------------------------------
-- Webhook idempotency -- insert the Stripe event id first; a unique-constraint
-- conflict means "already processed," so the handler can return 200 and stop
-- instead of re-applying the same payment/inventory change twice.
-- ---------------------------------------------------------------------

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
create policy "admin only" on webhook_events for all using (is_admin());

-- ---------------------------------------------------------------------
-- Real discount mechanics (buy-X-get-Y + usage limits). The 3 BXGY promotions
-- reference specific Shopify collection or product ids as their eligible-item
-- set; stored as jsonb id arrays rather than new join tables since checkout only
-- ever needs a membership check against this list, not relational querying.
-- ---------------------------------------------------------------------

alter table discounts add column buy_quantity integer;
alter table discounts add column buy_item_type text check (buy_item_type in ('collection', 'product', 'all'));
alter table discounts add column buy_item_ids jsonb;
alter table discounts add column get_quantity integer;
alter table discounts add column get_percentage numeric(5, 2);
alter table discounts add column get_item_type text check (get_item_type in ('collection', 'product', 'all'));
alter table discounts add column get_item_ids jsonb;
alter table discounts add column combines_with_order boolean not null default false;
alter table discounts add column combines_with_product boolean not null default false;
alter table discounts add column combines_with_shipping boolean not null default false;
alter table discounts add column uses_per_order_limit integer;
alter table discounts add column usage_limit integer;
alter table discounts add column applies_once_per_customer boolean not null default false;

-- Tracks real redemptions so usage_limit / applies_once_per_customer are actually
-- enforceable (the schema had no usage-tracking at all before this).
create table discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references discounts (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  customer_email text,
  redeemed_at timestamptz not null default now()
);
create index discount_redemptions_discount_id_idx on discount_redemptions (discount_id);

alter table discount_redemptions enable row level security;
create policy "admin only" on discount_redemptions for all using (is_admin());
