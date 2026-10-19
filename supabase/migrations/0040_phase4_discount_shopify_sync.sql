-- Phase 4: tracks each discount's own Shopify-side counterpart, separate from the legacy
-- `shopify_id` column (which holds this row's id from the ORIGINAL Shopify export -- stale after
-- the store's catalog was regenerated, exactly like products/product_variants before the Phase 2
-- fix; see lib/shopify/discount-sync.ts for why it's never reused for this). Nullable: a 'draft'
-- discount that's never been synced has no Shopify counterpart yet.
alter table discounts add column if not exists shopify_discount_id text unique;
alter table discounts add column if not exists shopify_sync_status text check (shopify_sync_status in ('synced', 'error'));
alter table discounts add column if not exists shopify_sync_error text;
alter table discounts add column if not exists shopify_synced_at timestamptz;
