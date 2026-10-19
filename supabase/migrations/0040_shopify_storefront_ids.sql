-- Connects every Supabase product/variant to its counterpart in the NEW Shopify store (the one
-- being adopted for checkout). Deliberately separate from the pre-existing `shopify_id` columns
-- on products/product_variants/etc: those hold the id from the OLD Shopify store this catalog was
-- originally extracted from (see 0001_initial_schema.sql) and must stay untouched as historical
-- record. These new columns are nullable text (Shopify GraphQL GIDs, e.g.
-- "gid://shopify/Product/123") written by scripts/shopify/connect-storefront.ts after matching on
-- products.handle, never read for anything except the future Storefront API cart/checkout
-- integration.

alter table products add column shopify_product_id text unique;
alter table product_variants add column shopify_variant_id text unique;
