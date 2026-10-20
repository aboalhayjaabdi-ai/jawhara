"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendShippingConfirmationEmail } from "@/lib/email/shipping-confirmation";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";
import { buildEmailLineItems } from "@/lib/email/build-line-items";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";

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
    .select("id, order_number, email, shipping_address_id, shopify_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };

  const { data: items } = await supabaseService
    .from("order_items")
    .select(
      "id, title, sku, shopify_id, quantity, fulfilled_quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, image_is_variant_specific, variant_title_snapshot, product_variants(title)"
    )
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

  // Create the REAL Shopify fulfillment first -- notifyCustomer: false always, since Jawhara's
  // own branded email below (with the correct purchased-variant images) is the one and only
  // shipping email for a fulfillment created from this admin. If Shopify rejects this (nothing
  // left to fulfill there, a malformed tracking URL, a sync/auth error), stop here: no local
  // fulfillment row is written and no email is sent, so the order is never shown as shipped in
  // Jawhara when Shopify itself doesn't agree it shipped. An order with no shopify_id (a manual,
  // Jawhara-only order that was never pushed to Shopify) skips this entirely -- there is nothing
  // in Shopify to sync to.
  let shopifyFulfillmentId: string | null = null;
  let shopifySyncError: string | null = null;
  if (order.shopify_id) {
    const itemsWithShopifyId = requested.map((line) => ({ line, item: itemById.get(line.orderItemId)! }));
    const missingShopifyId = itemsWithShopifyId.find(({ item }) => !item.shopify_id);
    if (missingShopifyId) {
      return {
        ok: false,
        error: `${missingShopifyId.item.title}: artikeln saknar Shopify-koppling och kan inte levereras via Shopify.`,
      };
    }
    const result = await createShopifyFulfillment({
      shopifyOrderId: order.shopify_id,
      lineItems: itemsWithShopifyId.map(({ line, item }) => ({ shopifyLineItemId: item.shopify_id!, quantity: line.quantity })),
      trackingNumber: input.trackingNumber || null,
      trackingCompany: trackingCompany || null,
      trackingUrl: input.trackingUrl || null,
    });
    if (!result.ok) {
      return { ok: false, error: `Shopify nekade leveransen: ${result.error}` };
    }
    shopifyFulfillmentId = result.shopifyFulfillmentId;
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
      // shopify_id follows the same bare-numeric-tail convention every other table uses (and
      // that sync-orders.ts/order-sync-shared.ts upsert fulfillments pulled FROM Shopify by), so
      // a fulfillment is recognizable as "known to Shopify" the same way regardless of which
      // direction created it. shopify_fulfillment_id caches the full GID so later edits/cancels
      // can call the Admin API directly without reconstructing it.
      shopify_id: shopifyFulfillmentId ? shopifyFulfillmentId.split("/").pop() : null,
      shopify_fulfillment_id: shopifyFulfillmentId,
      shopify_sync_error: shopifySyncError,
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

  let notified = false;
  if (input.notifyCustomer && order.email) {
    const { data: address } = order.shipping_address_id
      ? await supabaseService
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, zip, country")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : { data: null };

    const lineItems = await buildEmailLineItems(
      requested.map((line) => {
        const item = itemById.get(line.orderItemId)! as any;
        return {
          id: item.id,
          title: item.title,
          quantity: line.quantity,
          unitPrice: Number(item.discounted_unit_price ?? item.unit_price),
          variantId: item.variant_id,
          productId: item.product_id,
          variantTitle: item.product_variants?.title ?? null,
          imageUrlSnapshot: item.image_url,
          variantTitleSnapshot: item.variant_title_snapshot,
        };
      })
    );

    await sendShippingConfirmationEmail({
      to: order.email,
      orderId,
      orderNumber: order.order_number,
      items: lineItems,
      shippingAddress: address
        ? { name: [address.first_name, address.last_name].filter(Boolean).join(" "), address1: address.address1, address2: address.address2, city: address.city, zip: address.zip, country: address.country }
        : null,
      trackingNumber: input.trackingNumber || null,
      carrier: trackingCompany || null,
    });
    notified = true;
    await supabaseService.from("fulfillments").update({ notification_sent_at: new Date().toISOString() }).eq("id", fulfillment.id);
  }

  await logAdminAction(admin.adminId, "orders.create_fulfillment", "order", orderId, {
    fulfillmentId: fulfillment.id,
    shopifyFulfillmentId,
    items: requested,
    notified,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
