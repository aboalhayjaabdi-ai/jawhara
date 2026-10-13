import { sendEmail } from "./send";
import { refundNotificationTemplate, type OrderLineItem } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/refund-notification.ts must never be imported into client code");
}

export async function sendRefundNotificationEmail(params: {
  to: string;
  orderNumber: string;
  refundAmount: number;
  reason?: string | null;
  items?: OrderLineItem[];
}) {
  const { to, ...templateParams } = params;
  const content = await getLiveEmailTemplate("refund_notification");
  const { subject, html } = refundNotificationTemplate(content, templateParams);
  await sendEmail({ to, subject, html });
}
