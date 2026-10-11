-- Phase 2: complete order management. Adds the schema needed for admin-initiated fulfillment,
-- refunds (with a hard Shopify-vs-Stripe safety distinction), cancellation, returns/restock, and
-- manual orders, plus line-item-level progress tracking so partial fulfillment/refund/return are
-- correct from day one instead of order-level-only.

-- orders: explicit origin label (display/filtering only -- the refund-safety guard in
-- lib/orders/refund-guard.ts checks the `payments` table, not this column, since a manual order
-- paid via a real Stripe session still has real money to refund through Stripe) + who cancelled it.
alter table orders add column source text;
update orders set source = case
  when shopify_id is not null then 'shopify'
  when stripe_checkout_session_id is not null then 'stripe'
  else 'manual'
end;
alter table orders alter column source set not null;
alter table orders add constraint orders_source_check check (source in ('shopify', 'stripe', 'manual'));
alter table orders add column cancelled_by uuid references admin_users (id) on delete set null;

-- order_items: line-item-level fulfillment/refund progress.
alter table order_items add column fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0);
alter table order_items add column refunded_quantity integer not null default 0 check (refunded_quantity >= 0);

-- fulfillments: delivery timeline + who created it (null for historical Shopify-imported rows).
alter table fulfillments add column shipped_at timestamptz;
alter table fulfillments add column delivered_at timestamptz;
alter table fulfillments add column created_by uuid references admin_users (id) on delete set null;

create table fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references fulfillments (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  quantity integer not null check (quantity > 0)
);
create index fulfillment_items_fulfillment_id_idx on fulfillment_items (fulfillment_id);
create index fulfillment_items_order_item_id_idx on fulfillment_items (order_item_id);

-- refunds: the missing Stripe linkage, full/partial/manual-historical distinction, actor.
alter table refunds add column stripe_refund_id text unique;
alter table refunds add column kind text check (kind in ('full', 'partial', 'manual_historical'));
alter table refunds add column created_by uuid references admin_users (id) on delete set null;

create table refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  amount numeric(10, 2) not null
);
create index refund_items_refund_id_idx on refund_items (refund_id);

-- returns: resolution type, restock timestamp, actor.
alter table returns add column resolution text not null default 'refund' check (resolution in ('refund', 'exchange', 'none'));
alter table returns add column restocked_at timestamptz;
alter table returns add column created_by uuid references admin_users (id) on delete set null;

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  restock boolean not null default true
);
create index return_items_return_id_idx on return_items (return_id);

-- RLS for every new table, consistent with the existing "admin only" pattern.
alter table fulfillment_items enable row level security;
create policy "admin only" on fulfillment_items for all using (is_admin());
alter table refund_items enable row level security;
create policy "admin only" on refund_items for all using (is_admin());
alter table return_items enable row level security;
create policy "admin only" on return_items for all using (is_admin());

-- orders/order_items currently have SELECT-only policies (via "own orders"/"own order items") --
-- no admin WRITE policy exists yet. All Phase 2 writes go through the service-role client
-- (supabaseService), matching the existing checkout/webhook convention, so this is defense-in-
-- depth parity, not a functional requirement.
create policy "admin write" on orders for all using (is_admin());
create policy "admin write" on order_items for all using (is_admin());
