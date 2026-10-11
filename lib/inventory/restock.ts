import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/inventory/restock.ts must never be imported into client code");
}

export type RestockItem = { variantId: string | null; quantity: number };
export type RestockContext = { reason: "cancellation" | "return_restock" | "correction"; orderId?: string | null; actorId?: string | null };

/**
 * Adds inventory back for cancelled/returned line items. Extracted from the oversell-rollback
 * branch of app/api/webhooks/stripe/route.ts (the existing, already-proven precedent for "restock
 * via force_decrement_inventory with a negative quantity"), so cancellation (lib/orders/cancellation
 * actions) and returns (lib/orders/returns actions) share one implementation instead of duplicating
 * Shopify's tracked/policy branching inline a second and third time.
 *
 * `context` is required so every real restock call is attributed in the inventory_movements ledger
 * (Phase 3) -- which order it's tied to and which admin triggered it, so "why did this variant's
 * stock change" is always answerable from the ledger, not just inferred.
 */
export async function restockOrderItems(items: RestockItem[], context: RestockContext): Promise<void> {
  for (const item of items) {
    if (!item.variantId || item.quantity <= 0) continue;
    const { data: variant } = await supabaseService
      .from("product_variants")
      .select("inventory_tracked")
      .eq("id", item.variantId)
      .maybeSingle();
    if (!variant?.inventory_tracked) continue; // untracked -- the quantity is meaningless, never touched
    await supabaseService.rpc("force_decrement_inventory", {
      p_variant_id: item.variantId,
      p_qty: -item.quantity,
      p_reason: context.reason,
      p_order_id: context.orderId ?? null,
      p_actor_id: context.actorId ?? null,
    });
  }
}
