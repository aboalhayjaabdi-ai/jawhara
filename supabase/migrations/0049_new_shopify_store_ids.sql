-- Two-store Shopify switch-over (see lib/shopify/stores.ts, docs/new-shopify-store-import.md).
--
-- The new Shopify store's own ids for the shared catalog, next to the legacy store's
-- (shopify_product_id / shopify_variant_id / shopify_discount_id, which stay untouched).
-- Purely additive and nullable: nothing reads these columns while SHOPIFY_ACTIVE_STORE is unset
-- (legacy), so applying this changes nothing on the live site.
alter table products add column if not exists new_shopify_product_id text unique;
alter table product_variants add column if not exists new_shopify_variant_id text unique;
alter table discounts add column if not exists new_shopify_discount_id text unique;
