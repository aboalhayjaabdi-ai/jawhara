-- Durable monitoring for the Shopify/Meta integration, queryable from Supabase instead of relying
-- on ephemeral Vercel function logs (which this app's own operators can't easily inspect).
create table if not exists integration_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- 'webhook' | 'capi' | 'cron_sync'
  message text not null,
  context jsonb,
  order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table integration_errors enable row level security;
create policy "admin only" on integration_errors for all using (is_admin()) with check (is_admin());

-- Lightweight run history for the scheduled reconciliation sync (lib/shopify/sync-orders.ts),
-- the safety net for whenever a real-time webhook delivery doesn't arrive.
create table if not exists cron_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  pulled_count integer not null,
  imported_count integer not null,
  error_count integer not null
);

alter table cron_sync_runs enable row level security;
create policy "admin only" on cron_sync_runs for all using (is_admin()) with check (is_admin());
