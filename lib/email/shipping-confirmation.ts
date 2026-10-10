import { sendEmail } from "./send";
import { shippingConfirmationTemplate, type OrderLineItem, type ShippingAddress } from "./templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/shipping-confirmation.ts must never be imported into client code");
}

export async function sendShippingConfirmationEmail(params: {
  to: string;
  orderNumber: string;
  items: OrderLineItem[];
  shippingAddress: ShippingAddress;
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
}) {
  const { to, ...templateParams } = params;
  const { subject, html } = shippingConfirmationTemplate(templateParams);
  await sendEmail({ to, subject, html });
}
