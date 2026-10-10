-- Atomic "decrement if sufficient stock" -- PostgREST can't express
-- "SET inventory_quantity = inventory_quantity - qty WHERE inventory_quantity >= qty"
-- as a single request (its update payload only takes literal values, not SQL
-- expressions), so a plain two-step read-then-write from the webhook handler would have
-- a race window between concurrent checkouts. This function makes the check-and-decrement
-- one atomic statement at the database level, which is what actually prevents overselling.

create or replace function decrement_inventory(p_variant_id uuid, p_qty integer)
returns boolean
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  update product_variants
  set inventory_quantity = inventory_quantity - p_qty
  where id = p_variant_id and inventory_quantity >= p_qty;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;
