// Pure logic, no imports -- safe to use from both server code and "use client" components.
//
// Matches Shopify's own real purchasability rules, which earlier code got wrong by checking only
// `inventory_quantity > 0` everywhere:
// - A variant with inventory tracking DISABLED in Shopify is always purchasable, regardless of
//   its recorded quantity (including zero or negative) -- the quantity number is meaningless for
//   an untracked variant and must never gate anything.
// - A tracked variant with policy CONTINUE ("continue selling when out of stock") is always
//   purchasable too, by explicit merchant choice.
// - A tracked variant with policy DENY is purchasable only while quantity >= the requested qty.
// - A product that isn't ACTIVE (draft/archived) is never purchasable, whatever its variants say.

export type VariantAvailability = {
  productStatus: string;
  inventoryTracked: boolean;
  inventoryPolicy: string | null;
  inventoryQuantity: number;
};

export function isVariantAvailable(v: VariantAvailability, qty: number): boolean {
  if (v.productStatus !== "active") return false;
  if (!v.inventoryTracked) return true;
  if (v.inventoryPolicy === "CONTINUE") return true;
  return v.inventoryQuantity >= qty;
}
