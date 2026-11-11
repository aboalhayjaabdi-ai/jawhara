"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client";
import { DELIVERY_TIME_LONG, getDeliveryTimeNote } from "@/lib/delivery-time";

/**
 * "Two separate parcels" notice in the cart drawer, just above the totals.
 *
 * Delivery groups use exactly the same rule as the product-page delivery-time box
 * (lib/delivery-time.ts), from the same collection data the website uses:
 *   A = bags with longer delivery (in "Väskor"/its sub-categories, never "H väskor").
 *   B = everything else (H väskor, jewelry, wallets, gift sets, ...).
 * Shown only when the cart holds at least one A and at least one B product. Purely
 * informational -- no effect on prices, shipping or checkout.
 */

const TEXT = "Din beställning skickas i 2 separata paket eftersom vissa produkter har längre leveranstid.";

// productId -> true when the product is in group A. Module-level so a product's group is only
// fetched once per page load; removing an item (or re-adding a known one) updates instantly.
const longDeliveryCache = new Map<string, boolean>();

export function CartSplitDeliveryNotice({ productIds }: { productIds: string[] }) {
  const ids = useMemo(() => Array.from(new Set(productIds)).sort(), [productIds]);
  const idsKey = ids.join(",");
  // Bumped after each fetch so the component re-reads the cache.
  const [, setVersion] = useState(0);

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

  // Decide only once every product's group is known, so the notice never flashes on/off.
  if (ids.length < 2 || !ids.every((id) => longDeliveryCache.has(id))) return null;
  const hasA = ids.some((id) => longDeliveryCache.get(id));
  const hasB = ids.some((id) => !longDeliveryCache.get(id));
  if (!hasA || !hasB) return null;

  return (
    <div className="mb-3 flex items-start gap-2.5 border border-line bg-[#f7f7f7] px-3 py-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-px shrink-0" aria-hidden>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="19" r="1.6" />
        <circle cx="17.5" cy="19" r="1.6" />
      </svg>
      <p className="text-xs leading-[18px]">{TEXT}</p>
    </div>
  );
}
