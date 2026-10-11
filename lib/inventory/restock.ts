import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/inventory/restock.ts must never be imported into client code");
}

export type RestockItem = { variantId: string | null; quantity: number };

/**
 * Adds inventory back for cancelled/returned line items. Extracted from the oversell-rollback
 * branch of app/api/webhooks/stripe/route.ts (the existing, already-proven precedent for "restock
 * via force_decrement_inventory with a negative quantity"), so cancellation (lib/orders/cancellation
 * actions) and returns (lib/orders/returns actions) share one implementation instead of duplicating
 * Shopify's tracked/policy branching inline a second and third time.
 */
export async function restockOrderItems(items: RestockItem[]): Promise<void> {
  for (const item of items) {
    if (!item.variantId || item.quantity <= 0) continue;
    const { data: variant } = await supabaseService
      .from("product_variants")
      .select("inventory_tracked")
      .eq("id", item.variantId)
      .maybeSingle();
    if (!variant?.inventory_tracked) continue; // untracked -- the quantity is meaningless, never touched
    await supabaseService.rpc("force_decrement_inventory", { p_variant_id: item.variantId, p_qty: -item.quantity });
  }
}
