"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client";
import { getCartDeliveryGroup, type CartDeliveryGroup } from "@/lib/delivery-time";

/**
 * Each cart product's delivery group (lib/delivery-time.ts getCartDeliveryGroup) -- the same rule
 * as the product-page delivery-time box, from the same collection data the website uses.
 */

// productId -> delivery group. Module-level so a product is only looked up once per page load;
// removing an item (or re-adding a known one) updates instantly.
const groupCache = new Map<string, CartDeliveryGroup>();

/** Returns a lookup for the given product ids: the group once known, undefined while loading. */
export function useCartDeliveryGroups(productIds: string[]): (productId: string) => CartDeliveryGroup | undefined {
  const ids = useMemo(() => Array.from(new Set(productIds)).sort(), [productIds]);
  const idsKey = ids.join(",");
  // Bumped after each fetch so consumers re-read the cache.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = ids.filter((id) => !groupCache.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("collection_products")
        .select("product_id, collections(handle)")
        .in("product_id", missing);
      if (error || cancelled) return;
      const handlesByProduct = new Map<string, string[]>(missing.map((id) => [id, []]));
      for (const row of (data ?? []) as any[]) {
        const handle = row.collections?.handle;
        if (typeof handle === "string") handlesByProduct.get(row.product_id)?.push(handle);
      }
      for (const [id, handles] of handlesByProduct) groupCache.set(id, getCartDeliveryGroup(handles));
      setVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (productId: string) => groupCache.get(productId), [version, idsKey]);
}
