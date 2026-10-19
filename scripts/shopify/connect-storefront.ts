import { writeFileSync, mkdirSync } from "node:fs";
import { paginateAll, shopifyGraphQL } from "./client.ts";
import { supabaseService } from "../../lib/supabase/service-client.ts";

// Matches every Supabase product/variant against the NEW Shopify store (the one all SHOPIFY_*
// env vars point at -- see scripts/shopify/client.ts) so the storefront can later add the right
// Shopify variant to a Storefront API cart without touching product pages, images, or prices.
//
// Match key: products.handle / Shopify's product handle. The bulk product import into the new
// store preserved Supabase's handle verbatim (confirmed by spot-checking several products), which
// makes handle a far more reliable join key than SKU -- the imported Shopify "sku" field is
// actually a material description (e.g. "18K GULDPLÄTERAT TITAN STÅL") repeated across dozens of
// unrelated products, not a real per-item SKU. Variants within a matched product are then joined
// by their exact variant title (e.g. "17.7 cm"), which also round-tripped verbatim.
//
// Read-only by default. Pass --write to persist shopify_product_id/shopify_variant_id onto
// products/product_variants -- requires the migration that adds those columns to already be
// applied (see supabase/migrations/0040_shopify_storefront_ids.sql); --write fails loudly and
// changes nothing if the columns don't exist yet.

type ShopifyVariant = { id: string; title: string; sku: string | null; price: string };
type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  status: string;
  variants: { edges: { node: ShopifyVariant }[] };
};

type SupaVariant = { id: string; title: string; sku: string | null; price: string | number };
type SupaProduct = { id: string; handle: string; title: string; status: string; product_variants: SupaVariant[] };

const WRITE = process.argv.includes("--write");

// ---------------------------------------------------------------------
// 1. Pull every product from the new Shopify store
// ---------------------------------------------------------------------
const shopifyProducts: ShopifyProduct[] = [];
await paginateAll<ShopifyProduct>(
  `query ($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          handle
          title
          status
          variants(first: 100) {
            edges { node { id title sku price } }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }`,
  (data: any) => data.products,
  (nodes) => {
    shopifyProducts.push(...nodes);
  },
  50
);
console.log(`Fetched ${shopifyProducts.length} products from the Shopify store.`);

const shopifyByHandle = new Map(shopifyProducts.map((p) => [p.handle, p]));

// ---------------------------------------------------------------------
// 2. Pull every product + variant from Supabase (paginated -- PostgREST caps page size)
// ---------------------------------------------------------------------
const supaProducts: SupaProduct[] = [];
const PAGE = 500;
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supabaseService
    .from("products")
    .select("id, handle, title, status, product_variants(id, title, sku, price)")
    .order("handle")
    .range(offset, offset + PAGE - 1);
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  supaProducts.push(...((data ?? []) as any));
  if (!data || data.length < PAGE) break;
}
console.log(`Fetched ${supaProducts.length} products from Supabase.`);

// ---------------------------------------------------------------------
// 3. Match
// ---------------------------------------------------------------------
type ProductMatch = {
  supabaseProductId: string;
  handle: string;
  title: string;
  shopifyProductId: string | null;
  variantMatches: { supabaseVariantId: string; variantTitle: string; shopifyVariantId: string | null; priceMismatch: boolean }[];
};

const matches: ProductMatch[] = [];
let productsMatched = 0;
let productsUnmatched = 0;
let variantsMatched = 0;
let variantsUnmatched = 0;
let priceMismatches = 0;

for (const sp of supaProducts) {
  const shopifyProduct = shopifyByHandle.get(sp.handle) ?? null;
  const match: ProductMatch = {
    supabaseProductId: sp.id,
    handle: sp.handle,
    title: sp.title,
    shopifyProductId: shopifyProduct?.id ?? null,
    variantMatches: [],
  };

  if (shopifyProduct) {
    productsMatched++;
    const shopifyVariantsByTitle = new Map(shopifyProduct.variants.edges.map((e) => [e.node.title, e.node]));
    const shopifyVariantsInOrder = shopifyProduct.variants.edges.map((e) => e.node);
    const sameCount = (sp.product_variants ?? []).length === shopifyVariantsInOrder.length;

    (sp.product_variants ?? []).forEach((sv, idx) => {
      let shopifyVariant = shopifyVariantsByTitle.get(sv.title) ?? null;
      // Fallback to positional match only when counts line up and no title match was found --
      // handles the rare case of a variant renamed on one side but not the other.
      if (!shopifyVariant && sameCount) shopifyVariant = shopifyVariantsInOrder[idx] ?? null;

      if (shopifyVariant) {
        variantsMatched++;
        const mismatch = Number(sv.price).toFixed(2) !== Number(shopifyVariant.price).toFixed(2);
        if (mismatch) priceMismatches++;
        match.variantMatches.push({
          supabaseVariantId: sv.id,
          variantTitle: sv.title,
          shopifyVariantId: shopifyVariant.id,
          priceMismatch: mismatch,
        });
      } else {
        variantsUnmatched++;
        match.variantMatches.push({ supabaseVariantId: sv.id, variantTitle: sv.title, shopifyVariantId: null, priceMismatch: false });
      }
    });
  } else {
    productsUnmatched++;
    variantsUnmatched += (sp.product_variants ?? []).length;
  }

  matches.push(match);
}

const shopifyOnlyHandles = [...shopifyByHandle.keys()].filter((h) => !supaProducts.some((sp) => sp.handle === h));

// ---------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------
console.log("\n================ SHOPIFY STOREFRONT CONNECT REPORT ================");
console.log(`Supabase products:           ${supaProducts.length}`);
console.log(`  matched to a Shopify product:   ${productsMatched}`);
console.log(`  unmatched (no Shopify handle):  ${productsUnmatched}`);
console.log(`Variants matched:             ${variantsMatched}`);
console.log(`Variants unmatched:           ${variantsUnmatched}`);
console.log(`Price mismatches (matched):   ${priceMismatches}`);
console.log(`Shopify products with no Supabase counterpart (extra/test products in the new store): ${shopifyOnlyHandles.length}`);
if (shopifyOnlyHandles.length > 0 && shopifyOnlyHandles.length <= 30) {
  console.log(`  handles: ${shopifyOnlyHandles.join(", ")}`);
}

mkdirSync("data/exports", { recursive: true });
writeFileSync(
  "data/exports/shopify-storefront-connect-report.json",
  JSON.stringify({ ranAt: new Date().toISOString(), productsMatched, productsUnmatched, variantsMatched, variantsUnmatched, priceMismatches, shopifyOnlyHandles, matches }, null, 2)
);
console.log("\nFull report written to data/exports/shopify-storefront-connect-report.json");

if (productsUnmatched > 0) {
  console.log("\nUnmatched products:");
  for (const m of matches.filter((m) => !m.shopifyProductId)) console.log(`  - ${m.handle} (${m.title})`);
}

// ---------------------------------------------------------------------
// 5. Optionally persist -- requires the ID columns to already exist (see migration 0040)
// ---------------------------------------------------------------------
if (!WRITE) {
  console.log("\nDry run only (pass --write to persist). Nothing was written to Supabase.");
  process.exit(0);
}

console.log("\nWriting shopify_product_id / shopify_variant_id to Supabase...");
let productsWritten = 0;
let variantsWritten = 0;
for (const m of matches) {
  if (!m.shopifyProductId) continue;
  const { error: pErr } = await supabaseService
    .from("products")
    .update({ shopify_product_id: m.shopifyProductId })
    .eq("id", m.supabaseProductId);
  if (pErr) {
    console.error(`Failed to write product ${m.handle}: ${pErr.message}`);
    console.error("Has migration 0040_shopify_storefront_ids.sql been applied? Aborting.");
    process.exit(1);
  }
  productsWritten++;

  for (const vm of m.variantMatches) {
    if (!vm.shopifyVariantId) continue;
    const { error: vErr } = await supabaseService
      .from("product_variants")
      .update({ shopify_variant_id: vm.shopifyVariantId })
      .eq("id", vm.supabaseVariantId);
    if (vErr) {
      console.error(`Failed to write variant ${vm.variantTitle} (${m.handle}): ${vErr.message}`);
      process.exit(1);
    }
    variantsWritten++;
  }
}
console.log(`Wrote shopify_product_id for ${productsWritten} products and shopify_variant_id for ${variantsWritten} variants.`);
