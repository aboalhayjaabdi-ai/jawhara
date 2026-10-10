-- The original Shopify export already captured inventoryItem.tracked per variant
-- (scripts/shopify/extract/products.ts), but it was never carried into the schema -- only
-- inventory_policy (DENY/CONTINUE) was, and that column was itself never actually read anywhere
-- in the application. Every availability check used raw inventory_quantity > 0 only, which is
-- wrong for any variant with tracking disabled in Shopify (those are always purchasable
-- regardless of recorded quantity) and for tracked variants with the "continue selling when out
-- of stock" policy (always purchasable too, by design).

alter table product_variants add column inventory_tracked boolean not null default true;
