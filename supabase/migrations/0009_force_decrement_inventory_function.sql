-- Unconditional decrement for tracked variants whose Shopify inventory policy is CONTINUE
-- ("continue selling when out of stock") -- unlike decrement_inventory, this never blocks on
-- insufficient stock (that's the whole point of the policy) and is allowed to go negative.
-- Never called for untracked variants (those are never decremented at all) or DENY-policy
-- variants (those use the existing strict decrement_inventory).

create or replace function force_decrement_inventory(p_variant_id uuid, p_qty integer)
returns void
language plpgsql
security definer
as $$
begin
  update product_variants
  set inventory_quantity = inventory_quantity - p_qty
  where id = p_variant_id;
end;
$$;
