-- Extends force_decrement_inventory (0005/0009/0013) with one more trailing default param so an
-- admin-initiated inventory adjustment (lib/admin/inventory-ledger.ts, Phase 3) can attach a
-- free-text note to its ledger row -- same safe extension technique 0013 already used, so every
-- existing caller (webhook, lib/inventory/consume.ts, lib/inventory/restock.ts) keeps working with
-- zero code changes.
create or replace function force_decrement_inventory(
  p_variant_id uuid, p_qty integer,
  p_reason text default 'manual_adjustment', p_order_id uuid default null, p_actor_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_new_qty integer;
begin
  update product_variants
  set inventory_quantity = inventory_quantity - p_qty
  where id = p_variant_id
  returning inventory_quantity into v_new_qty;
  insert into inventory_movements (variant_id, delta, reason, note, resulting_quantity, order_id, actor_id)
  values (p_variant_id, -p_qty, p_reason, p_note, v_new_qty, p_order_id, p_actor_id);
end;
$$;
