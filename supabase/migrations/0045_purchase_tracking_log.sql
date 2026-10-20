-- One row per Meta Purchase reporting attempt, so actual end-to-end latency (payment -> webhook
-- receipt -> Meta submission -> Meta acceptance) is measurable, and so a webhook that never
-- arrives (source stays 'cron_sync'/'github_actions' instead of 'webhook') is visible rather than
-- silently invisible.
create table if not exists purchase_tracking_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  source text not null, -- 'webhook' | 'cron_sync' | 'github_actions'
  payment_confirmed_at timestamptz, -- Shopify's own processed_at for the order
  detected_at timestamptz not null default now(), -- when THIS caller first observed the order as newly paid
  capi_submitted_at timestamptz,
  capi_accepted_at timestamptz,
  capi_error text,
  created_at timestamptz not null default now()
);

create index if not exists purchase_tracking_log_order_id_idx on purchase_tracking_log (order_id);

alter table purchase_tracking_log enable row level security;
create policy "admin only" on purchase_tracking_log for all using (is_admin()) with check (is_admin());
