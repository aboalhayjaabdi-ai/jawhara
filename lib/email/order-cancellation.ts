import { sendEmail } from "./send";
import { orderCancellationTemplate, type OrderLineItem } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/order-cancellation.ts must never be imported into client code");
}

export async function sendOrderCancellationEmail(params: { to: string; orderNumber: string; items: OrderLineItem[]; reason?: string | null }) {
  const { to, ...templateParams } = params;
  const content = await getLiveEmailTemplate("order_cancellation");
  const { subject, html } = orderCancellationTemplate(content, templateParams);
  await sendEmail({ to, subject, html });
}
