import { sendEmail, type SendEmailResult } from "./send";

if (typeof window !== "undefined") {
  throw new Error("lib/email/new-review-notification.ts must never be imported into client code");
}

/** The shop's own inbox -- this notification never goes to a customer. */
export const NEW_REVIEW_NOTIFY_TO = "support@jawhara.se";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Tells the shop a review was just published on the site (storefront reviews go live immediately),
 * with everything needed to judge it at a glance and a link straight to the admin page where it can
 * be removed.
 */
export async function sendNewReviewNotification(params: {
  reviewId: string;
  productTitle: string;
  productHandle: string;
  rating: number;
  authorName: string | null;
  body: string | null;
  verified: boolean;
  orderNumber: string | null;
  customerEmail: string | null;
  photoUrls: string[];
}): Promise<SendEmailResult> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
  const stars = "★".repeat(params.rating) + "☆".repeat(5 - params.rating);
  const adminUrl = `${siteUrl}/admin/reviews/${params.reviewId}`;
  const productUrl = `${siteUrl}/products/${encodeURIComponent(params.productHandle)}#recensioner`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding: 4px 12px 4px 0; color: #666; font-size: 13px; white-space: nowrap;" valign="top">${label}</td><td style="padding: 4px 0; font-size: 14px;">${value}</td></tr>`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
      <div style="text-align: center; padding: 24px 0 8px;"><span style="font-size: 20px; letter-spacing: 0.1em; font-weight: 600;">JAWHARA</span></div>
      <h1 style="font-size: 18px; font-weight: 600; margin: 24px 0 4px;">Ny recension publicerad</h1>
      <p style="font-size: 14px; color: #666; margin: 0 0 16px;">Den syns redan på hemsidan. Ta bort den i admin om den inte ska vara kvar.</p>
      <div style="font-size: 22px; letter-spacing: 2px; margin: 8px 0 12px;">${stars}</div>
      ${params.body ? `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">&ldquo;${esc(params.body)}&rdquo;</p>` : ""}
      ${
        params.photoUrls.length
          ? `<div style="margin: 0 0 16px;">${params.photoUrls
              .map((u) => `<img src="${esc(u)}" width="80" height="80" alt="" style="width:80px; height:80px; object-fit:cover; border:1px solid #eee; margin-right:6px;" />`)
              .join("")}</div>`
          : ""
      }
      <table role="presentation" style="border-collapse: collapse; margin: 0 0 20px;">
        ${row("Produkt", `<a href="${productUrl}" style="color:#111;">${esc(params.productTitle)}</a>`)}
        ${row("Namn", esc(params.authorName ?? "Anonym"))}
        ${row("Verifierat köp", params.verified ? `Ja${params.orderNumber ? ` (order ${esc(params.orderNumber)})` : ""}` : "Nej")}
        ${params.customerEmail ? row("E-post", esc(params.customerEmail)) : ""}
      </table>
      <a href="${adminUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; text-transform: uppercase; letter-spacing: 0.06em; font-size: 12px; font-weight: 600; padding: 14px 24px;">Visa / ta bort i admin</a>
    </div>`;

  const who = params.authorName ?? "Anonym";
  return sendEmail({
    to: NEW_REVIEW_NOTIFY_TO,
    subject: `Ny recension ${stars} – ${params.productTitle} (${who})`,
    html,
  });
}
