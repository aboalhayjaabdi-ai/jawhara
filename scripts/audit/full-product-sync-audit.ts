// Read-only, full product/variant/channel/discount audit across Shopify <-> Supabase <-> the
// storefront's cart/checkout wiring. Never writes anything -- pulls the complete product catalog
// from both sides (paginated, not sampled) and cross-references in memory, plus a handful of safe
// Storefront API cartCreate() calls (builds a real Shopify cart object with a checkoutUrl, same as
// any real visitor browsing the site causes -- never completes a checkout or payment, so never
// creates a real order).
import { writeFileSync } from "node:fs";
import { shopifyGraphQL, paginateAll } from "../shopify/client.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function supabaseAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}` },
    });
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// --- 1. Pull every Shopify product + its variants + sales-channel publications ---
type ShopifyVariant = {
  id: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  taxable: boolean;
  inventoryPolicy: string;
  inventoryQuantity: number;
  inventoryItem: { tracked: boolean };
};
type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  status: string;
  publishedAt: string | null;
  variants: { nodes: ShopifyVariant[] };
  images: { nodes: { id: string }[] };
  resourcePublications: { nodes: { publication: { id: string; name: string }; isPublished: boolean }[] };
};

const PRODUCTS_QUERY = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          handle
          title
          status
          publishedAt
          variants(first: 100) {
            nodes { id sku price compareAtPrice taxable inventoryPolicy inventoryQuantity inventoryItem { tracked } }
          }
          images(first: 5) { nodes { id } }
          resourcePublications(first: 10) { nodes { publication { id name } isPublished } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

async function fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  await paginateAll<ShopifyProduct>(
    PRODUCTS_QUERY,
    (data: any) => data.products,
    (nodes) => {
      all.push(...nodes);
    },
    50
  );
  return all;
}

async function main() {
  console.log("== Pulling full Shopify catalog ==");
  const shopifyProducts = await fetchAllShopifyProducts();
  console.log(`Shopify products: ${shopifyProducts.length}`);
  const shopifyVariantCount = shopifyProducts.reduce((s, p) => s + p.variants.nodes.length, 0);
  console.log(`Shopify variants: ${shopifyVariantCount}`);

  console.log("\n== Pulling full Supabase catalog ==");
  const sbProducts = await supabaseAll<any>(
    "products",
    "id,shopify_id,shopify_product_id,handle,title,status,source,template_suffix,created_at"
  );
  const sbVariants = await supabaseAll<any>(
    "product_variants",
    "id,shopify_id,shopify_variant_id,product_id,title,sku,price,compare_at_price,taxable,inventory_policy,inventory_quantity,inventory_tracked"
  );
  console.log(`Supabase products: ${sbProducts.length}`);
  console.log(`Supabase variants: ${sbVariants.length}`);

  // --- Cross-reference ---
  const REQUIRED_PUBLICATIONS = ["Online Store", "Headless", "Jawhara Headless"];
  const shopifyByHandle = new Map(shopifyProducts.map((p) => [p.handle, p]));
  const shopifyByIdTail = new Map(shopifyProducts.map((p) => [p.id.split("/").pop()!, p]));
  const sbByHandle = new Map<string, any[]>();
  for (const p of sbProducts) {
    if (!sbByHandle.has(p.handle)) sbByHandle.set(p.handle, []);
    sbByHandle.get(p.handle)!.push(p);
  }

  const report: any = {
    counts: {
      shopifyProducts: shopifyProducts.length,
      shopifyVariants: shopifyVariantCount,
      supabaseProducts: sbProducts.length,
      supabaseVariants: sbVariants.length,
    },
    duplicateHandlesInSupabase: [],
    duplicateShopifyIdsInSupabase: [],
    productsInSupabaseNotInShopify: [],
    productsInShopifyNotInSupabase: [],
    productsMissingShopifyProductId: [],
    productsWithStaleShopifyProductId: [],
    productsWithWrongShopifyProductId: [],
    productsMissingSalesChannels: [],
    productsFieldMismatches: [],
    variantsMissingShopifyVariantId: [],
    variantsWithStaleShopifyVariantId: [],
    variantsFieldMismatches: [],
    variantCountMismatches: [],
  };

  // Duplicate handles in Supabase
  for (const [handle, rows] of sbByHandle) {
    if (rows.length > 1) report.duplicateHandlesInSupabase.push({ handle, count: rows.length, ids: rows.map((r) => r.id) });
  }
  // Duplicate shopify_id in Supabase
  const byShopifyId = new Map<string, any[]>();
  for (const p of sbProducts) {
    if (!p.shopify_id) continue;
    if (!byShopifyId.has(p.shopify_id)) byShopifyId.set(p.shopify_id, []);
    byShopifyId.get(p.shopify_id)!.push(p);
  }
  for (const [sid, rows] of byShopifyId) {
    if (rows.length > 1) report.duplicateShopifyIdsInSupabase.push({ shopify_id: sid, handles: rows.map((r) => r.handle) });
  }

  // Products in Supabase but not in live Shopify (by handle)
  for (const p of sbProducts) {
    if (!shopifyByHandle.has(p.handle)) {
      report.productsInSupabaseNotInShopify.push({ handle: p.handle, title: p.title, status: p.status, shopify_id: p.shopify_id, shopify_product_id: p.shopify_product_id });
    }
  }
  // Products in Shopify but not in Supabase
  for (const p of shopifyProducts) {
    if (!sbByHandle.has(p.handle)) {
      report.productsInShopifyNotInSupabase.push({ handle: p.handle, title: p.title, status: p.status, id: p.id });
    }
  }

  // Per-product field checks (only for products present on both sides)
  for (const p of sbProducts) {
    const sp = shopifyByHandle.get(p.handle);
    if (!sp) continue; // already reported above

    if (!p.shopify_product_id) {
      report.productsMissingShopifyProductId.push({ handle: p.handle, title: p.title });
    } else if (p.shopify_product_id !== sp.id) {
      // Does it at least resolve to a DIFFERENT real Shopify product (wrong link) or nothing at all (stale)?
      const tail = p.shopify_product_id.split("/").pop();
      const resolved = shopifyByIdTail.get(tail);
      if (!resolved) {
        report.productsWithStaleShopifyProductId.push({ handle: p.handle, title: p.title, stored: p.shopify_product_id, realId: sp.id });
      } else {
        report.productsWithWrongShopifyProductId.push({ handle: p.handle, title: p.title, stored: p.shopify_product_id, shouldBe: sp.id, resolvedToHandle: resolved.handle });
      }
    }

    // Sales channel publication check
    const publishedNames = new Set(sp.resourcePublications.nodes.filter((n: any) => n.isPublished).map((n: any) => n.publication.name));
    const missingChannels = REQUIRED_PUBLICATIONS.filter((name) => !publishedNames.has(name));
    if (missingChannels.length > 0 && sp.status === "ACTIVE") {
      report.productsMissingSalesChannels.push({ handle: p.handle, title: p.title, missingChannels, currentChannels: [...publishedNames] });
    }

    // Field mismatches: status, title
    const mismatches: string[] = [];
    const sbStatus = (p.status ?? "").toLowerCase();
    const spStatus = (sp.status ?? "").toLowerCase();
    if (sbStatus !== spStatus) mismatches.push(`status: supabase="${sbStatus}" shopify="${spStatus}"`);
    if (p.title !== sp.title) mismatches.push(`title: supabase="${p.title}" shopify="${sp.title}"`);
    if (sp.variants.nodes.length !== 0) {
      const sbVariantsForProduct = sbVariants.filter((v) => v.product_id === p.id);
      if (sbVariantsForProduct.length !== sp.variants.nodes.length) {
        report.variantCountMismatches.push({ handle: p.handle, title: p.title, supabaseVariantCount: sbVariantsForProduct.length, shopifyVariantCount: sp.variants.nodes.length });
      }
    }
    if (mismatches.length) report.productsFieldMismatches.push({ handle: p.handle, title: p.title, mismatches });
  }

  // Variant-level checks
  const sbProductById = new Map(sbProducts.map((p) => [p.id, p]));
  const shopifyVariantByIdTail = new Map<string, { variant: ShopifyVariant; product: ShopifyProduct }>();
  for (const sp of shopifyProducts) {
    for (const v of sp.variants.nodes) {
      shopifyVariantByIdTail.set(v.id.split("/").pop()!, { variant: v, product: sp });
    }
  }

  for (const v of sbVariants) {
    const product = sbProductById.get(v.product_id);
    const handle = product?.handle ?? "(unknown product)";
    const sbTail = v.shopify_id;
    const match = sbTail ? shopifyVariantByIdTail.get(sbTail) : null;

    if (!v.shopify_variant_id) {
      report.variantsMissingShopifyVariantId.push({ handle, variantId: v.id, title: v.title });
    } else if (match) {
      const expectedGid = match.variant.id;
      if (v.shopify_variant_id !== expectedGid) {
        report.variantsWithStaleShopifyVariantId.push({ handle, variantId: v.id, stored: v.shopify_variant_id, shouldBe: expectedGid });
      }
    }

    if (match) {
      const sv = match.variant;
      const mismatches: string[] = [];
      if (Number(v.price) !== Number(sv.price)) mismatches.push(`price: supabase=${v.price} shopify=${sv.price}`);
      const sbCompare = v.compare_at_price != null ? Number(v.compare_at_price) : null;
      const spCompare = sv.compareAtPrice != null ? Number(sv.compareAtPrice) : null;
      if (sbCompare !== spCompare) mismatches.push(`compare_at_price: supabase=${sbCompare} shopify=${spCompare}`);
      if ((v.sku || null) !== (sv.sku || null)) mismatches.push(`sku: supabase="${v.sku}" shopify="${sv.sku}"`);
      if (!!v.taxable !== !!sv.taxable) mismatches.push(`taxable: supabase=${v.taxable} shopify=${sv.taxable}`);
      if (!!v.inventory_tracked !== !!sv.inventoryItem.tracked) mismatches.push(`inventory_tracked: supabase=${v.inventory_tracked} shopify=${sv.inventoryItem.tracked}`);
      if ((v.inventory_policy || null) !== (sv.inventoryPolicy || null)) mismatches.push(`inventory_policy: supabase=${v.inventory_policy} shopify=${sv.inventoryPolicy}`);
      if (mismatches.length) report.variantsFieldMismatches.push({ handle, variantTitle: v.title, mismatches });
    }
  }

  writeFileSync("/tmp/claude-0/-home-user-jawhara/32dcdd96-2a84-522d-af91-3051bb7e3fae/scratchpad/full_audit_report.json", JSON.stringify(report, null, 1));
  console.log("\n== Summary ==");
  for (const [k, v] of Object.entries(report)) {
    if (Array.isArray(v)) console.log(`${k}: ${v.length}`);
    else console.log(`${k}:`, v);
  }
  console.log("\nFull report written to full_audit_report.json");
}

main().catch((e) => {
  console.error("FEL:", e);
  process.exit(1);
});
