-- Soft-delete ("hide") for orders -- never a real delete. Financial/accounting records, Stripe
-- payment references, refund history, and audit_log all stay completely intact; hiding only
-- changes what the admin's ordinary list/search/dashboard queries show by default.
alter table orders add column hidden_at timestamptz;
alter table orders add column hidden_by uuid references admin_users(id) on delete set null;
create index orders_hidden_at_idx on orders (hidden_at);

-- Removes the two hardcoded/placeholder carriers seeded in 0030 (PostNord/DHL) -- real order
-- data has never used them (the real carriers seen in Shopify-imported fulfillments are 4PX and
-- YunExpress). Matched by name AND the exact seeded tracking_url_template, so a carrier an admin
-- later renamed to "PostNord" with a different URL is never touched.
delete from shipping_carriers
where (name = 'PostNord' and tracking_url_template = 'https://www.postnord.se/en/tracking?shipmentId={trackingNumber}')
   or (name = 'DHL' and tracking_url_template = 'https://www.dhl.com/se-en/home/tracking.html?tracking-id={trackingNumber}');
