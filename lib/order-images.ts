import { supabaseService } from "@/lib/supabase/service-client";
import { mediaUrl } from "@/lib/supabase/media";

if (typeof window !== "undefined") {
  throw new Error("lib/order-images.ts must never be imported into client code");
}

export type OrderItemImage = { imageUrl: string | null; isVariantSpecific: boolean };

/**
 * Resolves the exact purchased-variant image for each order item -- never the product's generic
 * image when the purchased variant has its own (e.g. Noélle Väska Mini in black must show the
 * black bag, not whichever photo happens to be first). Falls back to the product's primary
 * (lowest-position) image only when no variant-specific image exists, and to no image (a
 * documented placeholder box, rendered by the caller) when neither exists.
 *
 * This reads the CURRENT media table, keyed by order_items.variant_id/product_id -- there is no
 * historical image snapshot stored on order_items (that would require writing to it from
 * app/api/checkout/route.ts or the Stripe webhook, which are off-limits without separate
 * explicit approval). In practice this only matters if a product's images are later
 * reassigned to different variants/positions; for the common case of unmodified product
 * images, live lookup and a true historical snapshot produce identical results.
 */
export async function getOrderItemImages(
  items: { id: string; variantId: string | null; productId: string | null }[]
): Promise<Record<string, OrderItemImage>> {
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))];
  const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];

  const [{ data: variantMedia }, { data: productMedia }] = await Promise.all([
    variantIds.length
      ? supabaseService.from("media").select("variant_id, storage_path, position").in("variant_id", variantIds).order("position")
      : Promise.resolve({ data: [] as any[] }),
    productIds.length
      ? supabaseService.from("media").select("product_id, storage_path, position").in("product_id", productIds).order("position")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const byVariant = new Map<string, string>();
  for (const m of variantMedia ?? []) {
    if (!byVariant.has(m.variant_id)) byVariant.set(m.variant_id, mediaUrl(m.storage_path));
  }
  const byProduct = new Map<string, string>();
  for (const m of productMedia ?? []) {
    if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, mediaUrl(m.storage_path));
  }

  const result: Record<string, OrderItemImage> = {};
  for (const item of items) {
    const variantImage = item.variantId ? byVariant.get(item.variantId) : undefined;
    if (variantImage) {
      result[item.id] = { imageUrl: variantImage, isVariantSpecific: true };
      continue;
    }
    const productImage = item.productId ? byProduct.get(item.productId) : undefined;
    result[item.id] = { imageUrl: productImage ?? null, isVariantSpecific: false };
  }
  return result;
}
