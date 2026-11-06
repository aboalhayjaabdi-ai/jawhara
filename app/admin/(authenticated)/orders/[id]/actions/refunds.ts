"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { getStripeRefundablePayment } from "@/lib/orders/refund-guard";
import { sendRefundNotificationEmail } from "@/lib/email/refund-notification";
import { buildEmailLineItems } from "@/lib/email/build-line-items";

export type RefundLineInput = { orderItemId: string; quantity: number; amount: number };
export type RefundResult = { ok: true; refundId: string; mode: "manual" } | { ok: false; error: string };

/**
 * The only place in the admin UI that can create a refund. Never moves money: Shopify orders are
 * refunded in Shopify Admin, and historical orders paid through Stripe (no longer integrated) must
 * be refunded in the Stripe Dashboard -- this only records manual refunds for orders with no
 * payment-provider money on them.
 */
export async function createRefund(
  orderId: string,
  input: { amount: number; reason?: string; lineItems?: RefundLineInput[]; returnId?: string }
): Promise<RefundResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (input.amount <= 0) return { ok: false, error: "Beloppet måste vara större än noll." };

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email, total_price, source")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };
  // Shopify orders are refunded in Shopify Admin only -- never here. Jawhara automatically
  // reflects the result (refund row + financial_status) once Shopify's own refund syncs back via
  // webhook or the reconciliation cron (see lib/shopify/order-sync-shared.ts), so this never
  // creates a misleading local-only "refunded" state that Shopify itself hasn't confirmed.
  if (order.source === "shopify") {
    return { ok: false, error: "Den här ordern kommer från Shopify. Hantera återbetalningen i Shopify Admin — Jawhara synkar den automatiskt när Shopify har bekräftat den." };
  }

  const { data: existingRefunds } = await supabaseService.from("refunds").select("amount").eq("order_id", orderId);
  const alreadyRefunded = (existingRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const isFull = alreadyRefunded + input.amount >= Number(order.total_price) - 0.01;

  const refundablePayment = await getStripeRefundablePayment(orderId);

  if (refundablePayment) {
    return {
      ok: false,
      error: "Den här ordern betalades via Stripe, som inte längre är kopplat till Jawhara. Gör återbetalningen direkt i Stripe Dashboard (dashboard.stripe.com).",
    };
  }

  const mode = "manual" as const;
  const { data: refundRow, error } = await supabaseService
    .from("refunds")
    .insert({
      order_id: orderId,
      return_id: input.returnId ?? null,
      kind: "manual_historical",
      amount: input.amount,
      reason: input.reason || null,
      created_by: admin.adminId,
    })
    .select("id")
    .single();
  if (error || !refundRow) return { ok: false, error: error?.message ?? "Kunde inte spara återbetalningen." };
  const refundId = refundRow.id;

  if (input.lineItems?.length) {
    await supabaseService
      .from("refund_items")
      .insert(input.lineItems.map((li) => ({ refund_id: refundId, order_item_id: li.orderItemId, quantity: li.quantity, amount: li.amount })));
    for (const li of input.lineItems) {
      const { data: item } = await supabaseService.from("order_items").select("refunded_quantity").eq("id", li.orderItemId).maybeSingle();
      if (item) {
        await supabaseService.from("order_items").update({ refunded_quantity: item.refunded_quantity + li.quantity }).eq("id", li.orderItemId);
      }
    }
  }

  await supabaseService.from("orders").update({ financial_status: isFull ? "REFUNDED" : "PARTIALLY_REFUNDED" }).eq("id", orderId);

  if (order.email) {
    let lineItems: Awaited<ReturnType<typeof buildEmailLineItems>> = [];
    if (input.lineItems?.length) {
      const { data: refundedItems } = await supabaseService
        .from("order_items")
        .select("id, title, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)")
        .in("id", input.lineItems.map((li) => li.orderItemId));
      const byId = new Map((refundedItems ?? []).map((i: any) => [i.id, i]));
      lineItems = await buildEmailLineItems(
        input.lineItems.map((li) => {
          const item = byId.get(li.orderItemId) as any;
          return {
            id: li.orderItemId,
            title: item?.title ?? "Produkt",
            quantity: li.quantity,
            unitPrice: li.quantity > 0 ? li.amount / li.quantity : li.amount,
            variantId: item?.variant_id ?? null,
            productId: item?.product_id ?? null,
            variantTitle: item?.product_variants?.title ?? null,
            imageUrlSnapshot: item?.image_url,
            variantTitleSnapshot: item?.variant_title_snapshot,
          };
        })
      );
    }
    await sendRefundNotificationEmail({ to: order.email, orderNumber: order.order_number, refundAmount: input.amount, reason: input.reason, items: lineItems });
  }

  await logAdminAction(admin.adminId, "orders.refund_manual", "order", orderId, {
    refundId,
    amount: input.amount,
    reason: input.reason ?? null,
    isFull,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, refundId, mode };
}
