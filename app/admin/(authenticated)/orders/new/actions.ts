"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { stripe } from "@/lib/stripe/server";
import { consumeInventoryForOrderItems } from "@/lib/inventory/consume";

export type ManualOrderLineInput = { productId: string; variantId: string; quantity: number; unitPrice: number };
export type CreateManualOrderResult = { ok: true; orderId: string; checkoutUrl?: string } | { ok: false; error: string };

/**
 * Two deliberate payment modes, not three options left open:
 * - "stripe_link": reuses the real, already-tested checkout/webhook pipeline. The webhook (zero
 *   new code) confirms payment, decrements inventory, and emails confirmation exactly as it does
 *   for a normal storefront checkout -- this order is indistinguishable to that pipeline from a
 *   customer-initiated one.
 * - "mark_paid": for a sale already settled outside the system (cash, bank transfer). Consumes
 *   inventory the same oversell-safe way the webhook does (lib/inventory/consume.ts, extracted
 *   from that exact logic) and errors -- rolling back the just-created order -- instead of
 *   silently creating a paid order for stock that doesn't exist.
 */
export async function createManualOrder(input: {
  email: string;
  items: ManualOrderLineInput[];
  note?: string;
  paymentMode: "stripe_link" | "mark_paid";
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

  if (input.paymentMode === "mark_paid") {
    const consumeResult = await consumeInventoryForOrderItems(input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })));
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
  const lineItems = input.items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency: "sek",
      unit_amount: Math.round(i.unitPrice * 100),
      product_data: { name: (variantById.get(i.variantId) as any)?.products?.title ?? "Jawhara-produkt" },
    },
  }));

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: input.email || undefined,
    shipping_address_collection: { allowed_countries: ["SE"] },
    phone_number_collection: { enabled: true },
    metadata: { order_id: order.id },
    success_url: `${siteUrl}/kassa/bekraftelse?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: siteUrl,
  });

  await supabaseService.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  await supabaseService.from("payments").insert({
    order_id: order.id,
    stripe_checkout_session_id: session.id,
    kind: "sale",
    status: "pending",
    gateway: "stripe",
    amount: subtotal,
    currency_code: "SEK",
  });

  await logAdminAction(admin.adminId, "orders.create_manual", "order", order.id, { amount: subtotal, mode: "stripe_link" });
  return { ok: true, orderId: order.id, checkoutUrl: session.url ?? undefined };
}
