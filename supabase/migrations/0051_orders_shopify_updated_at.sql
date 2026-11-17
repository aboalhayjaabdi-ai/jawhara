-- Shopify's own updatedAt for each order as of when it was last saved here. The 5-minute order
-- sweeps (app/api/cron/sync-orders) skip orders whose Shopify updatedAt has not moved past this.
alter table public.orders add column if not exists shopify_updated_at timestamptz;
