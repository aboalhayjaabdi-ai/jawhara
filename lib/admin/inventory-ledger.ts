import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/inventory-ledger.ts must never be imported into client code");
}

export type InventoryAdjustmentReason = "manual_adjustment" | "received_stock" | "damaged" | "correction";

export type AdjustInventoryInput = {
  variantId: string;
  /** 'set' -- value is the new target quantity. 'delta' -- value is the +/- change to apply. */
  mode: "set" | "delta";
  value: number;
  reason: InventoryAdjustmentReason;
  note?: string;
};

export type AdjustInventoryResult = { ok: true; newQuantity: number } | { ok: false; error: string };

/**
 * Admin-initiated inventory correction, matching real Shopify Admin's "set" and "adjust by" modes.
 * Always goes through force_decrement_inventory (migrations 0009/0013/0014) -- never the strict,
 * oversell-safe decrement_inventory, which exists for checkout concurrency, not admin corrections
 * that must always succeed (a restock to fix an undercount must never be blocked by a stock check
 * designed for a different purpose). Refuses on an untracked variant server-side, as defense in
 * depth beyond the admin UI's own disabled control -- the quantity is meaningless there and must
 * never be silently "adjusted" into looking meaningful.
 */
export async function adjustInventory(input: AdjustInventoryInput, actorId: string): Promise<AdjustInventoryResult> {
  const { data: variant } = await supabaseService
    .from("product_variants")
    .select("inventory_quantity, inventory_tracked")
    .eq("id", input.variantId)
    .maybeSingle();
  if (!variant) return { ok: false, error: "Varianten hittades inte." };
  if (!variant.inventory_tracked) return { ok: false, error: "Lagret spåras inte för denna variant -- kan inte justeras." };

  const current = variant.inventory_quantity;
  const target = input.mode === "set" ? input.value : current + input.value;
  if (!Number.isFinite(target) || target < 0) return { ok: false, error: "Lagerantalet kan inte bli negativt." };

  const delta = target - current;
  if (delta === 0) return { ok: true, newQuantity: current };

  // force_decrement_inventory sets inventory_quantity = inventory_quantity - p_qty, so an increase
  // (positive delta) needs a negative p_qty.
  const { error } = await supabaseService.rpc("force_decrement_inventory", {
    p_variant_id: input.variantId,
    p_qty: -delta,
    p_reason: input.reason,
    p_order_id: null,
    p_actor_id: actorId,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, newQuantity: target };
}
