import { sendEmail } from "./send";
import { orderConfirmationTemplate, type OrderLineItem, type ShippingAddress } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/order-confirmation.ts must never be imported into client code");
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderNumber: string;
  items: OrderLineItem[];
  subtotal: number;
  discountTotal: number;
  vat: number;
  shipping: number;
  total: number;
  shippingAddress: ShippingAddress;
}) {
  const { to, ...templateParams } = params;
  const content = await getLiveEmailTemplate("order_confirmation");
  const { subject, html } = orderConfirmationTemplate(content, templateParams);
  await sendEmail({ to, subject, html });
}
