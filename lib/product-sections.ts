import { unstable_cache } from "next/cache";
import { supabaseService } from "@/lib/supabase/service-client";
import { getAllProductCards, getCollectionProductCards, getCollectionProductIds, getProductCardsByIds, type ProductCard } from "@/lib/queries";

if (typeof window !== "undefined") {
  throw new Error("lib/product-sections.ts must never be imported into client code");
}

/**
 * Shared product-list resolution for the homepage (product_list sections) and the Black Month
 * page. Adds two optional, config-driven behaviors on top of a plain "first N of collection X":
 *
 *  - sort: "best-selling" -- orders the collection by REAL units sold (paid, non-cancelled,
 *    non-test orders in the last BEST_SELLING_DAYS days, synced from Shopify into order_items).
 *    Only products that actually sold are included, so a "bästsäljare" heading is never backed by
 *    invented data. Nothing is shown if nothing sold.
 *  - unique: true -- skips products already shown by an earlier section on the same page, so the
 *    same product isn't repeated (e.g. Black Month picks don't reappear under "Upptäck våra väskor").
 */
export type ProductListSpec = {
  collectionHandle: string;
  limit: number;
  sort?: "manual" | "best-selling";
  unique?: boolean;
};

export const BEST_SELLING_DAYS = 90;

/** product id -> units sold. Aggregated server-side with the service client because order_items is
 * RLS-protected (customer data); only product ids and counts ever leave this function. */
async function fetchUnitsSoldByProduct(days: number): Promise<Record<string, number>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const units: Record<string, number> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseService
      .from("order_items")
      .select("product_id, quantity, orders!inner(processed_at, cancelled_at, financial_status, is_test_order)")
      .gte("orders.processed_at", since)
      .is("orders.cancelled_at", null)
      .eq("orders.is_test_order", false)
      .not("product_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data as any[]) {
      const status = String(row.orders?.financial_status ?? "").toLowerCase();
      if (status !== "paid" && status !== "partially_refunded") continue;
      units[row.product_id] = (units[row.product_id] ?? 0) + (row.quantity ?? 0);
    }
    if (data.length < PAGE) break;
  }
  return units;
}

// Sales move slowly relative to page views -- one aggregation per hour is plenty.
const getUnitsSoldByProduct = unstable_cache(fetchUnitsSoldByProduct, ["units-sold-by-product"], { revalidate: 3600 });

export async function resolveProductList(spec: ProductListSpec, exclude: ReadonlySet<string> = new Set()): Promise<ProductCard[]> {
  const skip = spec.unique ? exclude : new Set<string>();

  if (spec.sort === "best-selling") {
    const [ids, units] = await Promise.all([
      spec.collectionHandle === "all" ? Promise.resolve(null) : getCollectionProductIds(spec.collectionHandle),
      getUnitsSoldByProduct(BEST_SELLING_DAYS),
    ]);
    const pool = ids ?? Object.keys(units);
    const ranked = pool
      .filter((id) => (units[id] ?? 0) > 0 && !skip.has(id))
      .sort((a, b) => units[b] - units[a]);
    // Over-fetch a little: a ranked product can still drop out as inactive.
    const cards = await getProductCardsByIds(ranked.slice(0, spec.limit + 4));
    return cards.slice(0, spec.limit);
  }

  const fetchCount = spec.limit + skip.size;
  const cards =
    spec.collectionHandle === "all"
      ? (await getAllProductCards(fetchCount)).cards
      : await getCollectionProductCards(spec.collectionHandle, fetchCount);
  return cards.filter((c) => !skip.has(c.id)).slice(0, spec.limit);
}

/**
 * Resolves several lists in page order. Every list (unique or not) marks its products as "shown";
 * lists with `unique: true` skip anything shown above them. Lists without `unique` don't depend on
 * anything and start immediately in parallel; a unique list waits only for the lists above it.
 */
export async function resolveProductListsInOrder<K extends string>(
  specs: { key: K; spec: ProductListSpec }[],
  /** Products already on the page from elsewhere (e.g. pre-resolved campaign sections); unique lists skip them too. */
  initialShown: ReadonlySet<string> = new Set()
): Promise<Map<K, ProductCard[]>> {
  const pending: Promise<ProductCard[]>[] = [];
  for (const { spec } of specs) {
    if (!spec.unique) {
      pending.push(resolveProductList(spec));
      continue;
    }
    const above = [...pending];
    pending.push(
      Promise.all(above).then((lists) => {
        const shown = new Set([...initialShown, ...lists.flat().map((c) => c.id)]);
        return resolveProductList(spec, shown);
      })
    );
  }
  const results = await Promise.all(pending);
  return new Map(specs.map(({ key }, i) => [key, results[i]]));
}
