import { supabaseService } from "@/lib/supabase/service-client";
import { restockOrderItems } from "./restock";

if (typeof window !== "undefined") {
  throw new Error("lib/inventory/consume.ts must never be imported into client code");
}

export type ConsumeItem = { variantId: string | null; quantity: number };
export type ConsumeContext = { orderId?: string | null; actorId?: string | null };
export type ConsumeResult = { ok: true } | { ok: false; oversoldVariantId: string };

/**
 * Oversell-safe inventory decrement for a set of line items, extracted from the identical inline
 * loop in app/api/webhooks/stripe/route.ts's handleCheckoutCompleted (the three real Shopify
 * semantics: untracked variants are never touched, tracked+CONTINUE decrements unconditionally,
 * tracked+DENY decrements only while stock allows it). Used by manual-order "mark as paid" (which
 * has no Stripe webhook to do this for it) -- the webhook itself is left as-is, not refactored to
 * call this, since it already works and re-pointing it is unnecessary risk for this phase.
 *
 * `context` (optional -- the webhook's own inline copy has no admin/order context to pass, and
 * doesn't call this helper anyway) attributes the resulting ledger rows to the order/admin that
 * triggered them, same as restockOrderItems's required context.
 *
 * On a partial failure, rolls back whatever was already decremented in this same call before
 * reporting which variant oversold, so the caller never ends up with a half-consumed order.
 */
export async function consumeInventoryForOrderItems(items: ConsumeItem[], context: ConsumeContext = {}): Promise<ConsumeResult> {
  const decremented: { variantId: string; qty: number }[] = [];
  for (const item of items) {
    if (!item.variantId) continue;
    const { data: variant } = await supabaseService
      .from("product_variants")
      .select("inventory_tracked, inventory_policy")
      .eq("id", item.variantId)
      .maybeSingle();
    if (!variant?.inventory_tracked) continue;
    if (variant.inventory_policy === "CONTINUE") {
      await supabaseService.rpc("force_decrement_inventory", {
        p_variant_id: item.variantId,
        p_qty: item.quantity,
        p_reason: "sale",
        p_order_id: context.orderId ?? null,
        p_actor_id: context.actorId ?? null,
      });
      decremented.push({ variantId: item.variantId, qty: item.quantity });
      continue;
    }
    const { data: ok } = await supabaseService.rpc("decrement_inventory", {
      p_variant_id: item.variantId,
      p_qty: item.quantity,
      p_reason: "sale",
      p_order_id: context.orderId ?? null,
      p_actor_id: context.actorId ?? null,
    });
    if (ok) {
      decremented.push({ variantId: item.variantId, qty: item.quantity });
    } else {
      await restockOrderItems(decremented.map((d) => ({ variantId: d.variantId, quantity: d.qty })), {
        reason: "correction",
        orderId: context.orderId,
        actorId: context.actorId,
      });
      return { ok: false, oversoldVariantId: item.variantId };
    }
  }
  return { ok: true };
}
