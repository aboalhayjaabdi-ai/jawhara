// Shared synthetic sample data for previewing/test-sending email templates -- never real order
// data. Used by both the admin preview route and the test-send action so they can never drift.
import { orderConfirmationTemplate, shippingConfirmationTemplate, refundNotificationTemplate, type EmailTemplateContent } from "@/lib/email/templates";
import type { EmailTemplateKey } from "@/lib/admin/email-templates";

const SAMPLE_ORDER_NUMBER = "#SE1234";

function sampleParamsFor(key: EmailTemplateKey) {
  const items = [
    { title: "Klöver armband", variantTitle: null, qty: 1, unitPrice: 399 },
    { title: "Noélle Väska Mini", variantTitle: "Grå", qty: 1, unitPrice: 799 },
  ];
  const shippingAddress = { name: "Anna Andersson", address1: "Testgatan 1", address2: null, city: "Stockholm", zip: "111 22", country: "Sverige" };
  if (key === "order_confirmation") {
    return { orderNumber: SAMPLE_ORDER_NUMBER, items, subtotal: 1198, discountTotal: 0, vat: 0, shipping: 0, total: 1198, shippingAddress };
  }
  if (key === "shipping_confirmation") {
    return { orderNumber: SAMPLE_ORDER_NUMBER, items, shippingAddress, trackingNumber: "1234567890", carrier: "4PX", trackingPageUrl: "https://jawhara.se/sparra-mitt-paket?token=exempel" };
  }
  return { orderNumber: SAMPLE_ORDER_NUMBER, refundAmount: 399, reason: "En av produkterna var slut i lager." };
}

export function renderSampleEmail(key: EmailTemplateKey, content: EmailTemplateContent) {
  const params = sampleParamsFor(key);
  if (key === "order_confirmation") return orderConfirmationTemplate(content, params as any);
  if (key === "shipping_confirmation") return shippingConfirmationTemplate(content, params as any);
  return refundNotificationTemplate(content, params as any);
}
