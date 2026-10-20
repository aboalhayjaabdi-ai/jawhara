-- Tracks Shopify's own "test order" flag (set on orders created with test: true, e.g. via
-- Shopify's "Place test order" admin action or the orderCreate API) so a test order's purchase
-- never gets reported to Meta CAPI as a real conversion -- see lib/marketing/capi-purchase.ts.
alter table orders add column if not exists is_test_order boolean not null default false;
