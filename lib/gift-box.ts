import { supabase } from "./supabase/client";
import { mediaUrl } from "./supabase/media";
import { isVariantAvailable } from "./inventory";

export type GiftBoxOffer = {
  variantId: string;
  productHandle: string;
  title: string;
  price: number;
  image: string | null;
};

/** The real "Presentask" gift-box upsell product, read fresh so the cart checkbox's price and
 * availability always match the live product record -- never a hardcoded constant. Returns null
 * (checkbox hidden) if the product doesn't exist, isn't active, or its variant isn't purchasable. */
export async function getGiftBoxOffer(): Promise<GiftBoxOffer | null> {
  const { data: product } = await supabase
    .from("products")
    .select(
      "handle, title, status, media(storage_path, position), product_variants(id, price, inventory_quantity, inventory_tracked, inventory_policy)"
    )
    .eq("handle", "presentask")
    .maybeSingle();
  if (!product) return null;

  const variant = (product.product_variants ?? [])[0];
  if (!variant) return null;

  const available = isVariantAvailable(
    {
      productStatus: product.status,
      inventoryTracked: variant.inventory_tracked,
      inventoryPolicy: variant.inventory_policy,
      inventoryQuantity: variant.inventory_quantity,
    },
    1
  );
  if (!available) return null;

  const sortedMedia = [...(product.media ?? [])].sort((a, b) => a.position - b.position);

  return {
    variantId: variant.id,
    productHandle: product.handle,
    title: product.title,
    price: variant.price,
    image: sortedMedia[0] ? mediaUrl(sortedMedia[0].storage_path) : null,
  };
}
