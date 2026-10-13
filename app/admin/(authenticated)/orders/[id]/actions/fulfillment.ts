"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendShippingConfirmationEmail } from "@/lib/email/shipping-confirmation";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type FulfillmentLineInput = { orderItemId: string; quantity: number };

export async function createFulfillment(
  orderId: string,
  input: {
    items: FulfillmentLineInput[];
    trackingNumber?: string;
    trackingUrl?: string;
    notifyCustomer: boolean;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Carrier is never entered by hand -- this store ships exclusively via 4PX/YunExpress,
  // distinguishable by their tracking-number prefix (see lib/tracking/detect-carrier.ts).
  const trackingCompany = input.trackingNumber ? detectCarrierFromTrackingNumber(input.trackingNumber) : null;

  const requested = input.items.filter((i) => i.quantity > 0);
  if (requested.length === 0) return { ok: false, error: "Välj minst en artikel att leverera." };

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email, shipping_address_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };

  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, title, sku, quantity, fulfilled_quantity, unit_price, discounted_unit_price, variant_id")
    .eq("order_id", orderId);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  for (const line of requested) {
    const item = itemById.get(line.orderItemId);
    if (!item) return { ok: false, error: "En artikel i leveransen hittades inte." };
    const remaining = item.quantity - item.fulfilled_quantity;
    if (line.quantity > remaining) {
      return { ok: false, error: `${item.title}: endast ${remaining} kvar att leverera.` };
    }
  }

  const { data: fulfillment, error: fulfillmentError } = await supabaseService
    .from("fulfillments")
    .insert({
      order_id: orderId,
      status: "SUCCESS",
      tracking_number: input.trackingNumber || null,
      tracking_company: trackingCompany || null,
      tracking_url: input.trackingUrl || null,
      shipped_at: new Date().toISOString(),
      created_by: admin.adminId,
    })
    .select("id")
    .single();
  if (fulfillmentError || !fulfillment) return { ok: false, error: fulfillmentError?.message ?? "Kunde inte skapa leverans." };

  await registerFulfillmentsForTracking([
    { id: fulfillment.id, trackingNumber: input.trackingNumber || null, trackingCompany: trackingCompany || null },
  ]);

  await supabaseService.from("fulfillment_items").insert(
    requested.map((line) => ({ fulfillment_id: fulfillment.id, order_item_id: line.orderItemId, quantity: line.quantity }))
  );

  for (const line of requested) {
    const item = itemById.get(line.orderItemId)!;
    await supabaseService
      .from("order_items")
      .update({ fulfilled_quantity: item.fulfilled_quantity + line.quantity })
      .eq("id", line.orderItemId);
  }

  const { data: refreshedItems } = await supabaseService.from("order_items").select("quantity, fulfilled_quantity").eq("order_id", orderId);
  const allFulfilled = (refreshedItems ?? []).every((i) => i.fulfilled_quantity >= i.quantity);
  const anyFulfilled = (refreshedItems ?? []).some((i) => i.fulfilled_quantity > 0);
  const newStatus = allFulfilled ? "FULFILLED" : anyFulfilled ? "PARTIALLY_FULFILLED" : "UNFULFILLED";
  await supabaseService.from("orders").update({ fulfillment_status: newStatus }).eq("id", orderId);

  if (input.notifyCustomer && order.email) {
    const { data: address } = order.shipping_address_id
      ? await supabaseService
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, zip, country")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : { data: null };

    await sendShippingConfirmationEmail({
      to: order.email,
      orderId,
      orderNumber: order.order_number,
      items: requested.map((line) => {
        const item = itemById.get(line.orderItemId)!;
        return { title: item.title, qty: line.quantity, unitPrice: Number(item.discounted_unit_price ?? item.unit_price) };
      }),
      shippingAddress: address
        ? { name: [address.first_name, address.last_name].filter(Boolean).join(" "), address1: address.address1, address2: address.address2, city: address.city, zip: address.zip, country: address.country }
        : null,
      trackingNumber: input.trackingNumber || null,
      carrier: trackingCompany || null,
    });
  }

  await logAdminAction(admin.adminId, "orders.create_fulfillment", "order", orderId, {
    fulfillmentId: fulfillment.id,
    items: requested,
    notified: input.notifyCustomer && !!order.email,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
