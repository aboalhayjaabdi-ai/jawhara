// Pure template builders -- no sending, no Resend import, no database access. Kept separate so
// these can be previewed/reviewed independent of the send path. The genuinely editable prose
// (subject/heading/intro/outro) is passed in by the caller (fetched from the email_templates
// table, admin-editable at /admin/email-templates since Phase 5 of the admin-completion roadmap)
// -- the structured, data-driven parts below (order number, line items, totals, address, tracking)
// are never editable free text, so an admin edit can never corrupt a real order's numbers.

export type OrderLineItem = { title: string; variantTitle?: string | null; qty: number; unitPrice: number; imageUrl?: string | null };
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

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Fixed 64x64 image (or an identically-sized text placeholder when no real image is available)
// -- plain <img width/height> + a table-based placeholder rather than CSS object-fit/background
// images, since Outlook's desktop renderer (Word engine) ignores most CSS and some clients strip
// <style> blocks entirely; this markup renders correctly with only inline styles and HTML
// width/height attributes, which both Outlook and Gmail honor.
function itemImageCell(i: OrderLineItem) {
  const alt = escapeAttr([i.title, i.variantTitle].filter(Boolean).join(" – "));
  if (i.imageUrl) {
    return `<img src="${escapeAttr(i.imageUrl)}" width="64" height="64" alt="${alt}" style="display:block; width:64px; height:64px; border:0; outline:none; text-decoration:none; border-radius:2px;" />`;
  }
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:64px; height:64px;">
      <tr><td width="64" height="64" bgcolor="#f4f4f4" align="center" valign="middle" style="width:64px; height:64px; background-color:#f4f4f4; border:1px solid #eee; font-family: Arial, Helvetica, sans-serif; font-size:9px; letter-spacing:0.05em; color:#999;">JAWHARA</td></tr>
    </table>`;
}

function lineItemsTable(items: OrderLineItem[]) {
  const rows = items
    .map(
      (i) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 10px 8px 0; width: 64px;" valign="top">${itemImageCell(i)}</td>
        <td style="padding: 8px 0;" valign="top">
          ${i.title}${i.variantTitle ? `<br/><span style="color:#666; font-size: 12px;">${i.variantTitle}</span>` : ""}
          <br/><span style="color:#666; font-size: 12px;">Antal: ${i.qty}</span>
        </td>
        <td style="padding: 8px 0; text-align: right; white-space: nowrap;" valign="top">${formatSek(i.unitPrice * i.qty)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">${rows}</table>`;
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

export type AppliedDiscountSummary = { title: string; amountOff: number };

export function orderConfirmationTemplate(
  content: EmailTemplateContent,
  params: {
    orderNumber: string;
    items: OrderLineItem[];
    subtotal: number;
    discountTotal: number;
    appliedDiscounts?: AppliedDiscountSummary[];
    vat: number;
    shipping: number;
    shippingMethod?: string;
    total: number;
    shippingAddress: ShippingAddress;
  }
) {
  const { orderNumber, items, subtotal, discountTotal, appliedDiscounts, vat, shipping, shippingMethod, total, shippingAddress } = params;
  // Each discount by name when the breakdown is available (new orders, from orders.applied_discounts);
  // falls back to one combined "Rabatt" row for older orders that predate that column, so a
  // historical order's email never breaks.
  const discountRows =
    appliedDiscounts && appliedDiscounts.length > 0
      ? appliedDiscounts
          .map((d) => `<tr><td>${d.title}</td><td style="text-align: right;">-${formatSek(d.amountOff)}</td></tr>`)
          .join("")
      : discountTotal > 0
        ? `<tr><td>Rabatt</td><td style="text-align: right;">-${formatSek(discountTotal)}</td></tr>`
        : "";
  const shippingLabel = shippingMethod ? `Frakt (${shippingMethod})` : "Frakt";
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}</p>
    ${lineItemsTable(items)}
    <table style="width: 100%; font-size: 14px; margin-top: 8px;">
      <tr><td>Delsumma</td><td style="text-align: right;">${formatSek(subtotal)}</td></tr>
      ${discountRows}
      ${vat > 0 ? `<tr><td>Moms</td><td style="text-align: right;">${formatSek(vat)}</td></tr>` : ""}
      <tr><td>${shippingLabel}</td><td style="text-align: right;">${shipping > 0 ? formatSek(shipping) : "Gratis"}</td></tr>
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
    // Jawhara's own tracking page, pre-identified via a signed per-order token -- never an
    // external carrier URL. Always provided by the caller once a fulfillment exists.
    trackingPageUrl: string;
  }
) {
  const { orderNumber, items, shippingAddress, trackingNumber, carrier, trackingPageUrl } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}</p>
    ${lineItemsTable(items)}
    ${
      trackingNumber
        ? `<p style="font-size: 14px;"><strong>Spårningsnummer:</strong> ${trackingNumber}${carrier ? ` (${carrier})` : ""}</p>`
        : ""
    }
    <table role="presentation" style="margin: 20px 0;"><tr><td>
      <a href="${trackingPageUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em; font-size: 12px; font-weight: 600; padding: 14px 28px;">
        Spåra mitt paket
      </a>
    </td></tr></table>
    ${addressBlock(shippingAddress)}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}

export function refundNotificationTemplate(
  content: EmailTemplateContent,
  params: { orderNumber: string; refundAmount: number; reason?: string | null; items?: OrderLineItem[] }
) {
  const { orderNumber, refundAmount, reason, items } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}<br/>
    <strong>Återbetalt belopp:</strong> ${formatSek(refundAmount)}</p>
    ${items && items.length > 0 ? lineItemsTable(items) : ""}
    ${reason ? `<p style="font-size: 14px;">${reason}</p>` : ""}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}

export function orderCancellationTemplate(
  content: EmailTemplateContent,
  params: { orderNumber: string; items: OrderLineItem[]; reason?: string | null }
) {
  const { orderNumber, items, reason } = params;
  const body = `
    ${content.introHtml}
    <p style="font-size: 14px;"><strong>Ordernummer:</strong> ${orderNumber}</p>
    ${items.length > 0 ? lineItemsTable(items) : ""}
    ${reason ? `<p style="font-size: 14px;"><strong>Anledning:</strong> ${reason}</p>` : ""}
    ${content.outroHtml ?? ""}
  `;
  return { subject: substitute(content.subject, orderNumber), html: layout(content.heading, body) };
}
