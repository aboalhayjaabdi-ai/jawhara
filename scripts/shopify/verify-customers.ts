// Read-only customer/address reconciliation, same shape as reconcile-orders.ts and
// verify-catalog.ts: live re-pull of all Shopify customers, diffed against full current Supabase
// state (via runSql, not PostgREST selectAll, to avoid the 1000-row default cap). Writes nothing.
import { paginateAll } from "./client.ts";
import { runSql } from "../supabase/db.ts";
import { writeFileSync, mkdirSync } from "node:fs";

function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

const QUERY = `
  query($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          firstName
          lastName
          email
          phone
          note
          tags
          numberOfOrders
          createdAt
          updatedAt
          emailMarketingConsent { marketingState consentUpdatedAt }
          defaultAddress { id }
          addresses { id firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone company }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

console.log("Pulling live Shopify customers...");
const liveCustomers: any[] = [];
await paginateAll(QUERY, (d: any) => d.customers, async (nodes, pageNum) => {
  liveCustomers.push(...nodes);
  console.log(`  page ${pageNum}: +${nodes.length} (total ${liveCustomers.length})`);
}, 50);
console.log(`✓ Live Shopify customers: ${liveCustomers.length}\n`);

console.log("Pulling current Supabase state...");
const [supaCustomers, supaAddresses] = await Promise.all([
  runSql<any[]>(`select id, shopify_id, email, first_name, last_name, phone, accepts_marketing, note from customers`),
  runSql<any[]>(`select id, shopify_id, customer_id, first_name, last_name, address1, address2, city, province, zip, country, phone from addresses where customer_id is not null`),
]);
console.log(`✓ Supabase: ${supaCustomers.length} customers, ${supaAddresses.length} customer-linked addresses\n`);

const supaByShopifyId = new Map(supaCustomers.filter((c) => c.shopify_id).map((c) => [c.shopify_id, c]));
const liveByShopifyId = new Map(liveCustomers.map((c) => [idTail(c.id)!, c]));

const missingFromSupabase = liveCustomers.filter((c) => !supaByShopifyId.has(idTail(c.id)!));
const missingFromShopify = supaCustomers.filter((c) => c.shopify_id && !liveByShopifyId.has(c.shopify_id));

type Mismatch = { shopifyId: string; email: string; field: string; expected: string; actual: string };
const drifted: Mismatch[] = [];
function cmp(shopifyId: string, email: string, field: string, live: unknown, supa: unknown) {
  const l = live == null ? null : String(live);
  const s = supa == null ? null : String(supa);
  if (l !== s) drifted.push({ shopifyId, email, field, expected: l ?? "null", actual: s ?? "null" });
}

for (const live of liveCustomers) {
  const sid = idTail(live.id)!;
  const supa = supaByShopifyId.get(sid);
  if (!supa) continue;
  cmp(sid, live.email, "email", live.email || null, supa.email);
  cmp(sid, live.email, "first_name", live.firstName || null, supa.first_name);
  cmp(sid, live.email, "last_name", live.lastName || null, supa.last_name);
  cmp(sid, live.email, "phone", live.phone || null, supa.phone);
  cmp(sid, live.email, "accepts_marketing", live.emailMarketingConsent?.marketingState === "SUBSCRIBED", supa.accepts_marketing);
}

// addresses: diff by shopify_id the same way
const supaAddrByShopifyId = new Map(supaAddresses.filter((a) => a.shopify_id).map((a) => [a.shopify_id, a]));
let missingAddresses = 0;
for (const c of liveCustomers) {
  for (const a of c.addresses ?? []) {
    if (!supaAddrByShopifyId.has(idTail(a.id)!)) missingAddresses++;
  }
}

mkdirSync("data/exports", { recursive: true });
writeFileSync(
  "data/exports/customer-reconciliation-mismatches.json",
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      liveCustomerCount: liveCustomers.length,
      supabaseCustomerCount: supaCustomers.length,
      missingFromSupabase: missingFromSupabase.map((c) => ({ shopifyId: idTail(c.id), email: c.email, createdAt: c.createdAt })),
      missingFromShopify: missingFromShopify.map((c) => ({ shopifyId: c.shopify_id, email: c.email })),
      fieldDrift: drifted,
      missingAddresses,
    },
    null,
    2
  )
);

console.log("=== CUSTOMER RECONCILIATION SUMMARY ===");
console.log(`Live Shopify customers:    ${liveCustomers.length}`);
console.log(`Supabase customers:        ${supaCustomers.length}`);
console.log(`Missing from Supabase:     ${missingFromSupabase.length}`);
missingFromSupabase.forEach((c) => console.log(`    ${c.email} (${idTail(c.id)})`));
console.log(`Missing from live Shopify: ${missingFromShopify.length}`);
console.log(`Field drift:               ${drifted.length} mismatches`);
console.log(`Missing customer addresses: ${missingAddresses}`);
console.log("\nFull detail written to data/exports/customer-reconciliation-mismatches.json");
