"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { shopifyGraphQL } from "@/lib/shopify/client";
import { activeStore, ID_COLUMNS } from "@/lib/shopify/stores";
import { consumeInventoryForOrderItems } from "@/lib/inventory/consume";

export type ManualOrderLineInput = { productId: string; variantId: string; quantity: number; unitPrice: number };
export type CreateManualOrderResult = { ok: true; orderId?: string; checkoutUrl?: string } | { ok: false; error: string };

/**
 * Two deliberate payment modes, not three options left open:
 * - "shopify_invoice": creates a Shopify draft order and returns its invoice URL (Shopify's own
 *   hosted checkout). No Jawhara order row is created here -- when the customer pays, Shopify
 *   creates the real order and the existing Shopify webhook/sync imports it like any storefront
 *   order, so a local row would only become a duplicate.
 * - "mark_paid": for a sale already settled outside the system (cash, bank transfer). Consumes
 *   inventory the same oversell-safe way the webhook does (lib/inventory/consume.ts, extracted
 *   from that exact logic) and errors -- rolling back the just-created order -- instead of
 *   silently creating a paid order for stock that doesn't exist.
 */
export async function createManualOrder(input: {
  email: string;
  items: ManualOrderLineInput[];
  note?: string;
  paymentMode: "shopify_invoice" | "mark_paid";
}): Promise<CreateManualOrderResult> {
  const admin = await requireAdmin();
  if (!input.items.length) return { ok: false, error: "Lägg till minst en artikel." };
  if (input.paymentMode === "shopify_invoice") return createShopifyInvoiceOrder(admin.adminId, input);

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

  return { ok: false, error: "Okänt betalningssätt." };
}

const DRAFT_ORDER_CREATE = `
  mutation ($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name invoiceUrl }
      userErrors { field message }
    }
  }
`;

async function createShopifyInvoiceOrder(
  adminId: string,
  input: { email: string; items: ManualOrderLineInput[]; note?: string }
): Promise<CreateManualOrderResult> {
  const { data: variants } = await supabaseService
    .from("product_variants")
    .select(`id, price, shopify_variant_id:${ID_COLUMNS[activeStore()].variant}`)
    .in("id", input.items.map((i) => i.variantId));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const lineItems = [];
  for (const i of input.items) {
    const v = variantById.get(i.variantId);
    if (!v?.shopify_variant_id) return { ok: false, error: "En vald vara saknar koppling till Shopify och kan inte faktureras." };
    lineItems.push({
      variantId: v.shopify_variant_id,
      quantity: i.quantity,
      ...(Number(v.price) !== i.unitPrice ? { priceOverride: { amount: i.unitPrice.toFixed(2), currencyCode: "SEK" } } : {}),
    });
  }

  let result: any;
  try {
    result = await shopifyGraphQL(DRAFT_ORDER_CREATE, {
      input: { email: input.email || undefined, note: input.note || undefined, tags: ["jawhara-admin"], lineItems },
    });
  } catch (err) {
    return { ok: false, error: `Shopify kunde inte skapa fakturan: ${(err as Error).message}` };
  }
  const userErrors = result?.draftOrderCreate?.userErrors ?? [];
  if (userErrors.length) return { ok: false, error: userErrors.map((e: { message: string }) => e.message).join("; ") };
  const draft = result?.draftOrderCreate?.draftOrder;
  if (!draft?.invoiceUrl) return { ok: false, error: "Shopify returnerade ingen betalningslänk." };

  const amount = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  await logAdminAction(adminId, "orders.create_manual", "order", undefined, { amount, mode: "shopify_invoice", shopifyDraftOrderId: draft.id, draftName: draft.name });
  return { ok: true, checkoutUrl: draft.invoiceUrl };
}
