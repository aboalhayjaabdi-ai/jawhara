-- Fix: a single Shopify image can legitimately be attached to more than one
-- product (confirmed: 92 of 662 images in this catalog are shared across
-- multiple product listings). The original `unique (shopify_id)` constraint
-- assumed one image belongs to exactly one product, so the import step had
-- to silently drop every product's reference to a shared image after the
-- first one claimed it -- 23 products ended up missing some or all of their
-- real images in Supabase. Each (image, product) pairing is now its own row
-- (sharing the same underlying Storage object path per product), which is
-- what Shopify's own data model actually allows.

alter table media drop constraint media_shopify_id_key;
alter table media add constraint media_shopify_id_product_id_key unique (shopify_id, product_id);
