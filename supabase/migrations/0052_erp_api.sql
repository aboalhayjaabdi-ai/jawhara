-- ERP integration API (app/api/erp/v1, lib/erp). Additive only: no existing table is changed.

-- Which orders the freight forwarder's ERP has taken over, so an order is handed out once and
-- never processed twice. One row per order.
create table if not exists public.erp_order_exports (
  order_id uuid primary key references public.orders(id) on delete cascade,
  first_fetched_at timestamptz not null default now(),
  last_fetched_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  erp_reference text
);

-- Every ERP API call (no customer data): for troubleshooting, and as the store of responses that
-- an Idempotency-Key replays, so a retried POST never acts twice.
create table if not exists public.erp_api_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text not null,
  method text not null,
  path text not null,
  status integer,
  duration_ms integer,
  ip text,
  idempotency_key text,
  error text,
  response jsonb
);
create unique index if not exists erp_api_requests_idempotency_key_idx
  on public.erp_api_requests (method, path, idempotency_key)
  where idempotency_key is not null and status < 500;
create index if not exists erp_api_requests_created_at_idx on public.erp_api_requests (created_at desc);

-- Server-side only (service role); no browser access.
alter table public.erp_order_exports enable row level security;
alter table public.erp_api_requests enable row level security;
