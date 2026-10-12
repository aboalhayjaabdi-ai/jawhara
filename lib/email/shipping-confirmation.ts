import { sendEmail } from "./send";
import { shippingConfirmationTemplate, type OrderLineItem, type ShippingAddress } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";
import { buildTrackingLinkUrl } from "@/lib/tracking/token";

if (typeof window !== "undefined") {
  throw new Error("lib/email/shipping-confirmation.ts must never be imported into client code");
}

export async function sendShippingConfirmationEmail(params: {
  to: string;
  orderId: string;
  orderNumber: string;
  items: OrderLineItem[];
  shippingAddress: ShippingAddress;
  trackingNumber?: string | null;
  carrier?: string | null;
}) {
  const { to, orderId, ...templateParams } = params;
  const content = await getLiveEmailTemplate("shipping_confirmation");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
  const trackingPageUrl = buildTrackingLinkUrl(orderId, siteUrl);
  const { subject, html } = shippingConfirmationTemplate(content, { ...templateParams, trackingPageUrl });
  await sendEmail({ to, subject, html });
}
