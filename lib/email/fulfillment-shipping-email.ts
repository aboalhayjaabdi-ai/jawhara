import { supabaseService } from "@/lib/supabase/service-client";
import { sendShippingConfirmationEmail } from "./shipping-confirmation";
import { buildEmailLineItems } from "./build-line-items";

if (typeof window !== "undefined") {
  throw new Error("lib/email/fulfillment-shipping-email.ts must never be imported into client code");
}

/**
 * Sends the shipping confirmation for one fulfillment, built entirely from what is stored for it
 * (its items, the order's address and email, its tracking number), and stamps
 * fulfillments.notification_sent_at once Resend has accepted it. The one place every admin path
 * sends this email from -- creating a shipment (single or bulk) and adding tracking to a shipment
 * that had none -- so there is no per-path option to skip it and no role that sends it differently.
 *
 * Never throws: a failed send is logged by sendEmail (integration_errors) and the shipment itself
 * stands. Returns whether the email went out.
 */
export async function sendShippingEmailForFulfillment(fulfillmentId: string): Promise<boolean> {
  try {
    const { data: f } = await supabaseService
      .from("fulfillments")
      .select(
        "id, tracking_number, tracking_company, orders!inner(id, order_number, email, shipping_address_id), fulfillment_items(quantity, order_items(id, title, unit_price, discounted_unit_price, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)))"
      )
      .eq("id", fulfillmentId)
      .maybeSingle();
    const order = (f as any)?.orders;
    if (!f || !order?.email) return false;

    const { data: address } = order.shipping_address_id
      ? await supabaseService
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, zip, country")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : { data: null };

    const lineItems = await buildEmailLineItems(
      ((f as any).fulfillment_items ?? [])
        .filter((fi: any) => fi.order_items)
        .map((fi: any) => {
          const item = fi.order_items;
          return {
            id: item.id,
            title: item.title,
            quantity: fi.quantity,
            unitPrice: Number(item.discounted_unit_price ?? item.unit_price),
            variantId: item.variant_id,
            productId: item.product_id,
            variantTitle: item.product_variants?.title ?? null,
            imageUrlSnapshot: item.image_url,
            variantTitleSnapshot: item.variant_title_snapshot,
          };
        })
    );

    const sent = await sendShippingConfirmationEmail({
      to: order.email,
      orderId: order.id,
      orderNumber: order.order_number,
      items: lineItems,
      shippingAddress: address
        ? {
            name: [address.first_name, address.last_name].filter(Boolean).join(" "),
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            zip: address.zip,
            country: address.country,
          }
        : null,
      trackingNumber: f.tracking_number || null,
      carrier: f.tracking_company || null,
    });
    if (!sent.ok) return false;
    await supabaseService.from("fulfillments").update({ notification_sent_at: new Date().toISOString() }).eq("id", fulfillmentId);
    return true;
  } catch (err) {
    console.error(`Shipping email for fulfillment ${fulfillmentId} failed:`, err);
    return false;
  }
}
