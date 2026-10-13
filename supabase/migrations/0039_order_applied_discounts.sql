-- Cart/checkout discount-display round: snapshot the per-discount breakdown (title + amount) at
-- order-creation time so order confirmation emails and admin can show each applied discount by
-- name, not just the combined total_discounts figure already stored. Additive, display-only --
-- never read by checkout/webhook pricing or charge logic, which continue to use total_discounts.
alter table orders add column if not exists applied_discounts jsonb not null default '[]'::jsonb;
