import { sendEmail } from "./send";
import { reviewRequestTemplate, type ReviewRequestItem } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/review-request.ts must never be imported into client code");
}

export async function sendReviewRequestEmail(params: { to: string; orderNumber: string; items: ReviewRequestItem[] }) {
  const { to, ...templateParams } = params;
  const content = await getLiveEmailTemplate("review_request");
  const { subject, html } = reviewRequestTemplate(content, templateParams);
  await sendEmail({ to, subject, html });
}
