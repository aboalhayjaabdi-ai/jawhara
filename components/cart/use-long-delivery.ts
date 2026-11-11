"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client";
import { DELIVERY_TIME_LONG, getDeliveryTimeNote } from "@/lib/delivery-time";

/**
 * Which cart products have the longer bag delivery time -- exactly the same rule as the
 * product-page delivery-time box (lib/delivery-time.ts), from the same collection data the
 * website uses: bags in "Väskor"/its sub-categories, never "H väskor". Everything else
 * (H väskor, jewelry, wallets, gift sets, ...) is regular.
 */

// productId -> true when the product has the longer delivery time. Module-level so a product is
// only looked up once per page load; removing an item (or re-adding a known one) updates instantly.
const longDeliveryCache = new Map<string, boolean>();

/** Returns a lookup for the given product ids: true/false once known, undefined while loading. */
export function useLongDelivery(productIds: string[]): (productId: string) => boolean | undefined {
  const ids = useMemo(() => Array.from(new Set(productIds)).sort(), [productIds]);
  const idsKey = ids.join(",");
  // Bumped after each fetch so consumers re-read the cache.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = ids.filter((id) => !longDeliveryCache.has(id));
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
      for (const [id, handles] of handlesByProduct) longDeliveryCache.set(id, getDeliveryTimeNote(handles) === DELIVERY_TIME_LONG);
      setVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (productId: string) => longDeliveryCache.get(productId), [version, idsKey]);
}
