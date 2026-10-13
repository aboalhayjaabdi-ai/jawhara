import { sendEmail } from "./send";
import { orderConfirmationTemplate, type OrderLineItem, type ShippingAddress, type AppliedDiscountSummary } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";
import { SHIPPING_METHOD_NAME } from "@/lib/shipping-method";

if (typeof window !== "undefined") {
  throw new Error("lib/email/order-confirmation.ts must never be imported into client code");
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderNumber: string;
  items: OrderLineItem[];
  subtotal: number;
  discountTotal: number;
  appliedDiscounts?: AppliedDiscountSummary[];
  vat: number;
  shipping: number;
  total: number;
  shippingAddress: ShippingAddress;
}) {
  const { to, ...templateParams } = params;
  const content = await getLiveEmailTemplate("order_confirmation");
  const { subject, html } = orderConfirmationTemplate(content, { ...templateParams, shippingMethod: SHIPPING_METHOD_NAME });
  await sendEmail({ to, subject, html });
}
