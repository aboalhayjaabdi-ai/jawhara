-- Guest Stripe checkouts have no customer_id (addresses was customer-scoped only), so there was
-- nowhere to store a delivery address collected at checkout. Links an address row to an order
-- directly, independent of any customer record.

alter table addresses add column order_id uuid references orders (id) on delete cascade;
create index addresses_order_id_idx on addresses (order_id);

alter table orders add column shipping_address_id uuid references addresses (id);
