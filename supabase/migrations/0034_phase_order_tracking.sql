-- Independent order-tracking page (replacing the footer's "Spåra din beställning" link, which
-- currently points at the generic contact page). fulfillments/fulfillment_items already support
-- multiple shipments per order (fulfillments.order_id has no uniqueness constraint) -- no schema
-- change needed for that part. This adds: a numeric carrier code column for the real 17TRACK API
-- (populated once a 17TRACK account exists and the real PostNord/DHL codes are looked up -- not
-- invented here), a durable cache the customer-facing page reads from (so a page view never calls
-- 17TRACK live), and a rate-limit ledger for the public order+email lookup endpoint.

alter table shipping_carriers add column tracking_api_carrier_code integer;

create table tracking_cache (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references fulfillments(id) on delete cascade,
  raw_status jsonb,
  events jsonb not null default '[]'::jsonb,
  tracking_api_registered_at timestamptz,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fulfillment_id)
);

-- Keyed by IP + order number (not email, which would let an attacker enumerate valid order
-- numbers against many emails just as easily) -- caps lookups per IP per time window.
create table tracking_lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  order_number text not null,
  attempted_at timestamptz not null default now()
);
create index tracking_lookup_attempts_ip_time_idx on tracking_lookup_attempts (ip_address, attempted_at desc);

alter table tracking_cache enable row level security;
alter table tracking_lookup_attempts enable row level security;
-- The public lookup route uses the service-role client (same pattern as checkout/webhooks) to
-- verify order+email itself before ever reading tracking_cache -- there is no anon-read policy
-- here, since "logged in as nobody, but know an order number and email" is not a Supabase Auth
-- identity RLS can express; the verification happens in application code instead.
create policy "admin only" on tracking_cache for all using (is_admin());
create policy "admin only" on tracking_lookup_attempts for all using (is_admin());
