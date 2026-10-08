import { upsert, selectAll, insertMany } from "../rest.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

const customers = readJsonl("customers");

const customerRows = customers.map((c: any) => ({
  shopify_id: idTail(c.id),
  email: c.email || null,
  first_name: c.firstName || null,
  last_name: c.lastName || null,
  phone: c.phone || null,
  accepts_marketing: c.emailMarketingConsent?.marketingState === "SUBSCRIBED",
  marketing_consent_updated_at: c.emailMarketingConsent?.consentUpdatedAt || null,
  note: c.note || null,
  tags: c.tags || [],
}));

for (const batch of chunk(customerRows, 100)) {
  await upsert("customers", batch, "shopify_id");
}
console.log(`✓ customers: ${customerRows.length} upserted`);

const customerIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("customers", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

const addressRows: any[] = [];
for (const c of customers) {
  const customerId = customerIdByShopify.get(idTail(c.id)!);
  for (const a of c.addresses ?? []) {
    addressRows.push({
      shopify_id: idTail(a.id),
      customer_id: customerId,
      first_name: a.firstName || null,
      last_name: a.lastName || null,
      company: a.company || null,
      address1: a.address1 || null,
      address2: a.address2 || null,
      city: a.city || null,
      province: a.province || null,
      province_code: a.provinceCode || null,
      zip: a.zip || null,
      country: a.country || null,
      country_code: a.countryCodeV2 || null,
      phone: a.phone || null,
      is_default: c.defaultAddress?.id === a.id,
    });
  }
}
for (const batch of chunk(addressRows, 200)) {
  await upsert("addresses", batch, "shopify_id");
}
console.log(`✓ addresses: ${addressRows.length} upserted`);
