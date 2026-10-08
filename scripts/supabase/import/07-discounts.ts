import { upsert } from "../rest.ts";
import { idTail, readJsonl } from "./util.ts";

const discounts = readJsonl("discounts");

function extractValue(customerGets: any): { value_type: string | null; value: number | null } {
  const v = customerGets?.value;
  if (!v) return { value_type: null, value: null };
  if (v.__typename === "DiscountPercentage") return { value_type: "percentage", value: v.percentage };
  if (v.__typename === "DiscountAmount") return { value_type: "fixed_amount", value: Number(v.amount.amount) };
  return { value_type: null, value: null };
}

const rows = discounts.map((d: any) => {
  const disc = d.discount;
  const isCode = disc.__typename.startsWith("DiscountCode");
  const { value_type, value } = extractValue(disc.customerGets);
  return {
    shopify_id: idTail(d.id),
    title: disc.title || null,
    kind: isCode ? "code" : "automatic",
    code: disc.codes?.edges?.[0]?.node?.code ?? null,
    status: (disc.status || "active").toLowerCase(),
    value_type: disc.__typename.includes("FreeShipping") ? "free_shipping" : value_type,
    value,
    starts_at: disc.startsAt || null,
    ends_at: disc.endsAt || null,
  };
});

const result = await upsert("discounts", rows, "shopify_id");
console.log(`✓ discounts: ${result.length} upserted`);
