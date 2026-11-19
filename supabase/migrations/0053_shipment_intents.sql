-- Shipment intents (lib/fulfillment/shipment-intents.ts). Additive only: no existing table changes.
--
-- Written BEFORE a shipment is created in Shopify (from the ERP API or Jawhara admin), so a
-- shipment that Shopify accepted is never lost if a later step fails (the Supabase rows, 17TRACK,
-- the shipping email): the request finishes it, and otherwise the 5-minute order sync finishes it
-- from this row. Every step is idempotent, so finishing twice never creates a second shipment or
-- sends a second email.
create table if not exists public.shipment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  source text not null check (source in ('erp', 'admin', 'admin_bulk')),
  created_by uuid,
  tracking_number text,
  tracking_company text,
  tracking_url text,
  -- [{ "orderItemId": uuid, "quantity": int }]
  items jsonb not null,
  shopify_required boolean not null,
  shopify_fulfillment_id text,
  fulfillment_id uuid references public.fulfillments(id) on delete set null,
  register_tracking boolean not null,
  send_email boolean not null,
  -- pending: Shopify not (yet) known to have accepted it; shopify_failed: Shopify refused it,
  -- nothing was created; shopify_created: in Shopify, local steps not all done yet; completed;
  -- abandoned: never reached Shopify (or too old to finish automatically).
  status text not null default 'pending'
    check (status in ('pending', 'shopify_failed', 'shopify_created', 'completed', 'abandoned')),
  customer_notified boolean,
  attempts integer not null default 0,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- The same tracking number can only be in flight once per order (two simultaneous requests can
-- never both create a Shopify shipment for it).
create unique index if not exists shipment_intents_inflight_tracking_idx
  on public.shipment_intents (order_id, upper(tracking_number))
  where tracking_number is not null and status in ('pending', 'shopify_created');
create index if not exists shipment_intents_open_idx
  on public.shipment_intents (created_at)
  where status in ('pending', 'shopify_created');

-- Server-side only (service role); no browser access.
alter table public.shipment_intents enable row level security;
