// Pure template builders -- no sending, no Resend import, no database access. Kept separate so
// these can be previewed/reviewed independent of the send path. The genuinely editable prose
// (subject/heading/intro/outro) is passed in by the caller (fetched from the email_templates
// table, admin-editable at /admin/email-templates since Phase 5 of the admin-completion roadmap)
// -- the structured, data-driven parts below (order number, line items, totals, address, tracking)
// are never editable free text, so an admin edit can never corrupt a real order's numbers.

export type OrderLineItem = { title: string; variantTitle?: string | null; qty: number; unitPrice: number };
export type ShippingAddress = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
} | null;

/** The editable portion of a template, as stored in email_templates (either its live or draft
 * columns) -- {{orderNumber}} in `subject` is substituted by each builder below. */
export type EmailTemplateContent = { subject: string; heading: string; introHtml: string; outroHtml: string | null };

function formatSek(amount: number) {
  return `${Math.round(amount).toLocaleString("sv-SE")} kr`;
}

function substitute(text: string, orderNumber: string) {
  return text.replace(/\{\{\s*orderNumber\s*\}\}/g, orderNumber);
}

function layout(heading: string, bodyHtml: string) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <div style="text-align: center; padding: 24px 0 8px;">
        <span style="font-size: 20px; letter-spacing: 0.1em; font-weight: 600;">JAWHARA</span>
      </div>
      <h1 style="font-size: 18px; font-weight: 600; margin: 24px 0 8px;">${heading}</h1>
      ${bodyHtml}
      <p style="margin-top: 32px; color: #666; font-size: 13px;">
        Frågor? Kontakta oss på <a href="mailto:support@jawhara.se" style="color: #111;">support@jawhara.se</a>.<br/>
        Med vänliga hälsningar,<br/>Jawhara
      </p>
    </div>
  `;
}

function lineItemsTable(items: OrderLineItem[]) {
  const rows = items
    .map(
      (i) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0;">
          ${i.title}${i.variantTitle ? `<br/><span style="color:#666; font-size: 12px;">${i.variantTitle}</span>` : ""}
          <br/><span style="color:#666; font-size: 12px;">Antal: ${i.qty}</span>
        </td>
        <td style="padding: 8px 0; text-align: right; white-space: nowrap;">${formatSek(i.unitPrice * i.qty)}</td>
      </tr>`
    )
    .join("");
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">${rows}</table>`;
}

function addressBlock(address: ShippingAddress) {
  if (!address) return "";
  const lines = [address.name, address.address1, address.address2, [address.zip, address.city].filter(Boolean).join(" "), address.country]
    .filter(Boolean)
    .join("<br/>");
  return `
    <p style="font-size: 14px; margin-top: 16px;">
      <strong>Leveransadress</strong><br/>${lines}
    </p>
  `;
}

export function orderConfirmationTemplate(
  content: EmailTemplateContent,
  params: {
    orderNumber: string;
    items: OrderLineItem[];
    subtotal: number;
    discountTotal: number;
    vat: number;
    shipping: number;
    total: number;
    shippingAddress: ShippingAddress;
  }
) {
  const { orderNumber, items, subtotal, discountTotal, vat, shipping, total, shippingAddress } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}</p>
    ${lineItemsTable(items)}
    <table style="width: 100%; font-size: 14px; margin-top: 8px;">
      <tr><td>Delsumma</td><td style="text-align: right;">${formatSek(subtotal)}</td></tr>
      ${discountTotal > 0 ? `<tr><td>Rabatt</td><td style="text-align: right;">-${formatSek(discountTotal)}</td></tr>` : ""}
      ${vat > 0 ? `<tr><td>Moms</td><td style="text-align: right;">${formatSek(vat)}</td></tr>` : ""}
      <tr><td>Frakt</td><td style="text-align: right;">${shipping > 0 ? formatSek(shipping) : "Fri frakt"}</td></tr>
      <tr style="font-weight: 600;"><td style="padding-top: 8px;">Totalt</td><td style="text-align: right; padding-top: 8px;">${formatSek(total)}</td></tr>
    </table>
    ${addressBlock(shippingAddress)}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}

export function shippingConfirmationTemplate(
  content: EmailTemplateContent,
  params: {
    orderNumber: string;
    items: OrderLineItem[];
    shippingAddress: ShippingAddress;
    trackingNumber?: string | null;
    carrier?: string | null;
    trackingUrl?: string | null;
  }
) {
  const { orderNumber, items, shippingAddress, trackingNumber, carrier, trackingUrl } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}</p>
    ${lineItemsTable(items)}
    ${
      trackingNumber
        ? `<p style="font-size: 14px;"><strong>Spårningsnummer:</strong> ${trackingNumber}${carrier ? ` (${carrier})` : ""}
           ${trackingUrl ? `<br/><a href="${trackingUrl}" style="color:#111;">Spåra din leverans</a>` : ""}</p>`
        : ""
    }
    ${addressBlock(shippingAddress)}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}

export function refundNotificationTemplate(content: EmailTemplateContent, params: { orderNumber: string; refundAmount: number; reason?: string | null }) {
  const { orderNumber, refundAmount, reason } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}<br/>
    <strong>Återbetalt belopp:</strong> ${formatSek(refundAmount)}</p>
    ${reason ? `<p style="font-size: 14px;">${reason}</p>` : ""}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}
