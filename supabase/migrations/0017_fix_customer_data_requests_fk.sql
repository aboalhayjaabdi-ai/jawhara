-- customer_data_requests (0016) was defined with `customer_id uuid not null references
-- customers(id) on delete cascade` -- but the whole point of this table is to durably record that
-- a deletion request happened, including for a customer that was then actually, fully deleted.
-- With ON DELETE CASCADE, the moment deleteCustomerAction's hard delete runs, Postgres would
-- immediately delete the very audit row recording that it ran -- silently destroying the GDPR
-- accountability record it exists to keep. Switch to ON DELETE SET NULL (customer_id becomes
-- nullable): the request row survives the customer's deletion, with customer_id simply going to
-- null to reflect that the referenced row no longer exists.
alter table customer_data_requests drop constraint customer_data_requests_customer_id_fkey;
alter table customer_data_requests alter column customer_id drop not null;
alter table customer_data_requests add constraint customer_data_requests_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete set null;
