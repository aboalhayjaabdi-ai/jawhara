import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/discount-guard.ts must never be imported into client code");
}

export type DiscountImpact = { id: string; title: string; role: "buy" | "get" }[];

type ActiveDiscount = {
  id: string;
  title: string;
  buy_item_type: string | null;
  buy_item_ids: string[] | null;
  get_item_type: string | null;
  get_item_ids: string[] | null;
};

async function loadActiveDiscounts(): Promise<ActiveDiscount[]> {
  const { data } = await supabaseService
    .from("discounts")
    .select("id, title, buy_item_type, buy_item_ids, get_item_type, get_item_ids")
    .eq("status", "active");
  return (data as ActiveDiscount[]) ?? [];
}

/**
 * Read-only safety guard for the real risk confirmed in lib/discounts.ts: "3 för 2"/"Valfri
 * Plånbok" match eligibility live, at checkout time, against each item's shopify_id inside a
 * discount's buy_item_ids/get_item_ids jsonb arrays -- deleting a product/collection, or removing
 * a product from a collection, that's referenced there silently drops it from that discount with
 * zero error anywhere. This never blocks the action (the admin owns that decision); it only
 * surfaces which discounts would be affected, mirroring lib/discounts.ts's own qualifies() matching
 * logic exactly so the two can never disagree. 'all'-type discounts are deliberately excluded --
 * removing one item from a store-wide discount isn't the silent-breakage risk being guarded
 * against.
 */
export async function checkProductDiscountImpact(productId: string): Promise<DiscountImpact> {
  const { data: product } = await supabaseService
    .from("products")
    .select("shopify_id, collection_products(collections(shopify_id))")
    .eq("id", productId)
    .maybeSingle();
  if (!product?.shopify_id) return []; // manual (never-Shopify-synced) products can't appear in any jsonb id array

  const collectionShopifyIds: string[] = ((product as any).collection_products ?? [])
    .map((cp: any) => cp.collections?.shopify_id)
    .filter(Boolean);

  const discounts = await loadActiveDiscounts();
  const impact: DiscountImpact = [];
  for (const d of discounts) {
    if (d.buy_item_type === "product" && d.buy_item_ids?.includes(product.shopify_id)) impact.push({ id: d.id, title: d.title, role: "buy" });
    if (d.get_item_type === "product" && d.get_item_ids?.includes(product.shopify_id)) impact.push({ id: d.id, title: d.title, role: "get" });
    if (d.buy_item_type === "collection" && collectionShopifyIds.some((c) => d.buy_item_ids?.includes(c))) impact.push({ id: d.id, title: d.title, role: "buy" });
    if (d.get_item_type === "collection" && collectionShopifyIds.some((c) => d.get_item_ids?.includes(c))) impact.push({ id: d.id, title: d.title, role: "get" });
  }
  return impact;
}

export async function checkCollectionDiscountImpact(collectionShopifyId: string | null): Promise<DiscountImpact> {
  if (!collectionShopifyId) return []; // manual (never-Shopify-synced) collections can't appear in any jsonb id array
  const discounts = await loadActiveDiscounts();
  const impact: DiscountImpact = [];
  for (const d of discounts) {
    if (d.buy_item_type === "collection" && d.buy_item_ids?.includes(collectionShopifyId)) impact.push({ id: d.id, title: d.title, role: "buy" });
    if (d.get_item_type === "collection" && d.get_item_ids?.includes(collectionShopifyId)) impact.push({ id: d.id, title: d.title, role: "get" });
  }
  return impact;
}
