import type { EmailTemplateContent } from "./templates";

if (typeof window !== "undefined") {
  throw new Error("lib/email/delivery-check.ts must never be imported into client code");
}

/** Copy for the "Har du fått ditt paket?" email (lib/email/templates.ts deliveryCheckTemplate). */
export const DELIVERY_CHECK_DEFAULT_CONTENT: EmailTemplateContent = {
  subject: "Har du fått ditt paket? — order {{orderNumber}}",
  heading: "Hur gick det med din beställning?",
  introHtml:
    '<p style="font-size: 14px; line-height: 1.6;">Hej!</p><p style="font-size: 14px; line-height: 1.6;">Det har nu gått en tid sedan vi skickade din beställning {{orderNumber}}, och vi vill bara höra hur det har gått.</p>',
  outroHtml:
    '<p style="font-size: 13px; line-height: 1.6; color: #666;">Om något inte är som det ska, oavsett vad, hör av dig till oss först – vi löser det alltid tillsammans med dig.</p>',
};

/** Pre-filled email to support with the order number in the subject. */
export function deliveryCheckContactUrl(orderNumber: string): string {
  return `mailto:support@jawhara.se?subject=${encodeURIComponent(`Mitt paket – order ${orderNumber}`)}`;
}
