-- Expands the single flat-rate/country-list shipping setting (migration 0023) into a real
-- multi-zone rate model, and adds a saved carrier list for fulfillment tracking -- per the user's
-- explicit ask for "shipping zones, shipping rates, carrier settings, and fulfillment
-- configuration". Still deliberately NOT wired into the live checkout calculation (checkout
-- remains hardcoded free-shipping/SE-only, matching all 400 real historical orders) -- that
-- wiring is a separate, explicit go-ahead, same standing rule as migration 0023 itself. This is
-- real, persisted, admin-editable configuration; it is not yet consumed by app/api/checkout/route.ts.

create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  countries text[] not null default '{}',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shipping_rates (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references shipping_zones (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  min_order_value numeric(10, 2),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A saved list of carriers (name + an optional tracking-URL template using {trackingNumber}) to
-- populate the fulfillment form's carrier field as a dropdown instead of free text, and to
-- auto-fill the tracking URL. This is configuration only -- no real carrier API integration
-- (label purchasing, live rate lookup) exists or is claimed; that would require real carrier API
-- credentials, which have not been provided.
create table shipping_carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tracking_url_template text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table shipping_zones enable row level security;
alter table shipping_rates enable row level security;
alter table shipping_carriers enable row level security;
create policy "admin only" on shipping_zones for all using (is_admin());
create policy "admin only" on shipping_rates for all using (is_admin());
create policy "admin only" on shipping_carriers for all using (is_admin());
