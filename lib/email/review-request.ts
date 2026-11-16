import { sendEmail, type SendEmailResult } from "./send";
import { reviewRequestTemplate, type ReviewRequestItem } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/review-request.ts must never be imported into client code");
}

export async function sendReviewRequestEmail(params: {
  to: string;
  orderNumber: string;
  items: ReviewRequestItem[];
  subjectPrefix?: string;
}): Promise<SendEmailResult> {
  const { to, subjectPrefix, ...templateParams } = params;
  const content = await getLiveEmailTemplate("review_request");
  const { subject, html } = reviewRequestTemplate(content, templateParams);
  return sendEmail({ to, subject: `${subjectPrefix ?? ""}${subject}`, html });
}
