"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { consumeInventoryForOrderItems } from "@/lib/inventory/consume";

export type ManualOrderLineInput = { productId: string; variantId: string; quantity: number; unitPrice: number };
export type CreateManualOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

/**
 * For a sale already settled outside the system (cash, bank transfer, Shopify Checkout once that
 * lands). Consumes inventory the same oversell-safe way the webhook used to
 * (lib/inventory/consume.ts) and errors -- rolling back the just-created order -- instead of
 * silently creating a paid order for stock that doesn't exist.
 */
export async function createManualOrder(input: {
  email: string;
  items: ManualOrderLineInput[];
  note?: string;
}): Promise<CreateManualOrderResult> {
  const admin = await requireAdmin();
  if (!input.items.length) return { ok: false, error: "Lägg till minst en artikel." };

  const variantIds = input.items.map((i) => i.variantId);
  const { data: variants } = await supabaseService.from("product_variants").select("id, title, sku, product_id, products(title)").in("id", variantIds);
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const subtotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const { data: order, error: orderError } = await supabaseService
    .from("orders")
    .insert({
      order_number: `JH-${Date.now()}`,
      source: "manual",
      email: input.email || null,
      currency_code: "SEK",
      financial_status: "pending",
      subtotal_price: subtotal,
      total_shipping: 0,
      total_tax: 0,
      total_discounts: 0,
      total_price: subtotal,
      note: input.note || null,
    })
    .select("id")
    .single();
  if (orderError || !order) return { ok: false, error: orderError?.message ?? "Kunde inte skapa order." };

  const orderItemRows = input.items.map((i) => {
    const v = variantById.get(i.variantId) as any;
    return {
      order_id: order.id,
      variant_id: i.variantId,
      product_id: i.productId,
      title: v?.products?.title ?? "Produkt",
      sku: v?.sku ?? null,
      quantity: i.quantity,
      unit_price: i.unitPrice,
    };
  });
  await supabaseService.from("order_items").insert(orderItemRows);

  const consumeResult = await consumeInventoryForOrderItems(
    input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    { orderId: order.id, actorId: admin.adminId }
  );
  if (!consumeResult.ok) {
    await supabaseService.from("orders").delete().eq("id", order.id); // order_items cascade
    const variant = variantById.get(consumeResult.oversoldVariantId) as any;
    return { ok: false, error: `Lagret räcker inte för ${variant?.products?.title ?? "en vald vara"}.` };
  }

  await supabaseService.from("orders").update({ financial_status: "paid", processed_at: new Date().toISOString() }).eq("id", order.id);
  await supabaseService.from("payments").insert({
    order_id: order.id,
    kind: "sale",
    status: "succeeded",
    gateway: "manual",
    amount: subtotal,
    currency_code: "SEK",
    processed_at: new Date().toISOString(),
  });

  await logAdminAction(admin.adminId, "orders.mark_paid_manual", "order", order.id, { amount: subtotal });
  return { ok: true, orderId: order.id };
}
