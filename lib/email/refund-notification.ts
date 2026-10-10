import { sendEmail } from "./send";
import { refundNotificationTemplate } from "./templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/refund-notification.ts must never be imported into client code");
}

export async function sendRefundNotificationEmail(params: { to: string; orderNumber: string; refundAmount: number; reason?: string | null }) {
  const { to, ...templateParams } = params;
  const { subject, html } = refundNotificationTemplate(templateParams);
  await sendEmail({ to, subject, html });
}
