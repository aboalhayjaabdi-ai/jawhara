import { supabaseService } from "@/lib/supabase/service-client";
import { isVariantAvailable } from "@/lib/inventory";
import {
  StorefrontConfigError,
  cartCreate,
  cartDiscountCodesUpdate,
  cartGet,
  cartLinesAdd,
  cartLinesRemove,
  cartLinesUpdate,
  type CartLineInput,
  type CartUserError,
  type StorefrontCart,
} from "@/lib/shopify/storefront";

export type ShopifyCartSyncLine = { variantId: string; qty: number };

export type ShopifyCartSyncResult = {
  // null when there is nothing to sync yet, or sync failed outright (caller should retry with
  // the same shopifyCartId it already had -- this function never invents a cart id it can't
  // confirm exists).
  shopifyCartId: string | null;
  // Shopify's hosted checkout page for this exact cart (Phase 3) -- null under the same
  // conditions as shopifyCartId, plus whenever the API route decides checkout isn't enabled yet
  // (see app/api/shopify-cart/sync/route.ts; this function itself doesn't gate on that).
  checkoutUrl: string | null;
  // Phase 4: Shopify's own computed total for this exact cart (after its native discounts,
  // before shipping/tax -- neither is ever added at the cart stage, only at real checkout), in
  // SEK as a plain number. Null whenever shopifyCartId is. Compared against Jawhara's own total
  // (computeCheckoutTotals) by the caller (components/cart/cart-provider.tsx's goToCheckout) as
  // the price-parity guard the Phase 4 spec requires -- this module only ever reports the number,
  // it never decides whether a mismatch should block anything.
  shopifyTotal: number | null;
  // Phase 4: whether the discount code the caller passed in (if any) is one Shopify's cart
  // considers applicable to its current contents. False (not simply absent) is the signal a
  // dead/expired/out-of-scope code gives -- Shopify never errors the mutation itself for that.
  discountCodeApplicable: boolean | null;
  // Swedish, customer-safe messages -- never raw Shopify/GraphQL error text.
  warnings: string[];
};

function describeUserErrors(errors: CartUserError[]): string[] {
  return errors
    .filter((e) => e.message)
    .map(() => "Ett lagerproblem upptäcktes för en vara i varukorgen. Mängden kan ha justerats.");
}

function describeDiscountCodeErrors(errors: CartUserError[]): string[] {
  return errors.filter((e) => e.message).map(() => "Rabattkoden kunde inte tillämpas i Shopify-varukorgen.");
}

type VariantRow = {
  id: string;
  // Full "gid://shopify/ProductVariant/<id>" -- NOT the legacy `shopify_id` column (just the bare
  // numeric tail, and stale after the store's product/variant ids were regenerated). This is the
  // column the Phase 2 spec actually named, already backfilled and verified 100% current against
  // live Shopify -- see the Phase 2 follow-up investigation for how that was confirmed.
  shopify_variant_id: string | null;
  inventory_quantity: number;
  inventory_tracked: boolean;
  inventory_policy: string | null;
  products: { status: string } | { status: string }[] | null;
};

function productOf(row: VariantRow): { status: string } | null {
  if (!row.products) return null;
  return Array.isArray(row.products) ? row.products[0] ?? null : row.products;
}

/**
 * Resolves the Jawhara (Supabase) cart lines into the Shopify merchandise lines we're actually
 * allowed to put in a Storefront cart, re-deriving availability from Supabase exactly like
 * computeCheckoutTotals does (lib/discounts.ts) -- never trusts the qty the client asked for
 * once it exceeds real stock. Lines that can't map to Shopify at all (not yet synced, product
 * no longer active) are dropped with a warning instead of ever reaching the Storefront API.
 */
async function resolveDesiredLines(
  lines: ShopifyCartSyncLine[]
): Promise<{ desired: Map<string, number>; warnings: string[] }> {
  const warnings: string[] = [];
  const desired = new Map<string, number>();
  if (lines.length === 0) return { desired, warnings };

  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const { data, error } = await supabaseService
    .from("product_variants")
    .select("id, shopify_variant_id, inventory_quantity, inventory_tracked, inventory_policy, products!inner(status)")
    .in("id", variantIds);

  if (error || !data) {
    warnings.push("Kunde inte kontrollera varukorgen mot Shopify just nu.");
    return { desired, warnings };
  }

  const rowById = new Map((data as unknown as VariantRow[]).map((r) => [r.id, r]));
  let droppedUnmapped = false;
  let clamped = false;

  for (const line of lines) {
    const row = rowById.get(line.variantId);
    const product = row ? productOf(row) : null;
    if (!row || !product || product.status !== "active") {
      droppedUnmapped = true;
      continue;
    }
    if (!row.shopify_variant_id) {
      droppedUnmapped = true;
      continue;
    }

    let qty = line.qty;
    const available = isVariantAvailable(
      {
        productStatus: product.status,
        inventoryTracked: row.inventory_tracked,
        inventoryPolicy: row.inventory_policy,
        inventoryQuantity: row.inventory_quantity,
      },
      qty
    );
    if (!available) {
      if (row.inventory_tracked && row.inventory_policy !== "CONTINUE" && row.inventory_quantity > 0) {
        qty = row.inventory_quantity;
        clamped = true;
      } else {
        droppedUnmapped = true;
        continue;
      }
    }

    const merchandiseId = row.shopify_variant_id;
    desired.set(merchandiseId, (desired.get(merchandiseId) ?? 0) + qty);
  }

  if (droppedUnmapped) warnings.push("En eller flera varor kunde inte synkroniseras med Shopify.");
  if (clamped) warnings.push("Mängden för en vara justerades till tillgängligt lager.");

  return { desired, warnings };
}

/**
 * Reconciles the real Shopify Storefront cart to match the Jawhara cart's current contents.
 * Called after every add/remove/qty change (see components/cart/cart-provider.tsx) with the
 * FULL current line list, not a delta -- same "always recompute from the whole cart" approach
 * as computeCheckoutTotals, so a missed or out-of-order call can never leave Shopify holding
 * stale lines or duplicates.
 *
 * Never throws. Any Storefront API/config failure degrades to a warning and the caller's
 * existing shopifyCartId is returned unchanged, so a transient Shopify outage never breaks the
 * visible Jawhara cart (which is driven entirely by localStorage + Supabase, not by this).
 */
function emptyResult(shopifyCartId: string | null, warnings: string[]): ShopifyCartSyncResult {
  return { shopifyCartId, checkoutUrl: null, shopifyTotal: null, discountCodeApplicable: null, warnings };
}

function finalize(cart: StorefrontCart, discountCode: string | null, warnings: string[]): ShopifyCartSyncResult {
  const applied = discountCode ? cart.discountCodes.find((d) => d.code.toLowerCase() === discountCode.toLowerCase()) : null;
  const applicable = discountCode ? applied?.applicable ?? false : null;
  const allWarnings = applicable === false ? [...warnings, "Rabattkoden gäller inte för den här varukorgen i Shopify."] : warnings;
  return {
    shopifyCartId: cart.id,
    checkoutUrl: cart.checkoutUrl,
    shopifyTotal: Number(cart.cost.totalAmount.amount),
    discountCodeApplicable: applicable,
    warnings: allWarnings,
  };
}

/**
 * Reconciles the real Shopify Storefront cart to match the Jawhara cart's current contents and
 * entered discount code. Called after every add/remove/qty/code change (see components/cart/
 * cart-provider.tsx) with the FULL current line list, not a delta -- same "always recompute from
 * the whole cart" approach as computeCheckoutTotals, so a missed or out-of-order call can never
 * leave Shopify holding stale lines, duplicates, or a stale code.
 *
 * Never throws. Any Storefront API/config failure degrades to a warning and the caller's
 * existing shopifyCartId is returned unchanged, so a transient Shopify outage never breaks the
 * visible Jawhara cart (which is driven entirely by localStorage + Supabase, not by this).
 */
export async function syncShopifyCart(input: {
  shopifyCartId: string | null;
  lines: ShopifyCartSyncLine[];
  discountCode: string | null;
}): Promise<ShopifyCartSyncResult> {
  const { desired, warnings } = await resolveDesiredLines(input.lines);

  if (desired.size === 0) {
    // Either the Jawhara cart is empty, or nothing in it could map to Shopify -- nothing to
    // write. Keep whatever cart id we already had (it may still hold items from before a
    // removal that hasn't round-tripped yet); next sync with real lines will reconcile it.
    return emptyResult(input.shopifyCartId, warnings);
  }

  try {
    // Storefront API Cart has no field exposing "already converted to an order" in this API
    // version -- any cart id that still resolves is treated as usable. Checkout isn't wired to
    // actually convert a cart yet (Phase 3 only redirects to it; nothing completes a purchase),
    // so this can't yet go stale in practice -- revisit if that changes.
    let cart = input.shopifyCartId ? await cartGet(input.shopifyCartId) : null;
    const extraWarnings: string[] = [];

    if (!cart) {
      const lines: CartLineInput[] = [...desired.entries()].map(([merchandiseId, quantity]) => ({ merchandiseId, quantity }));
      const { cart: created, userErrors } = await cartCreate(lines);
      extraWarnings.push(...describeUserErrors(userErrors));
      if (!created) return emptyResult(null, [...warnings, ...extraWarnings]);
      cart = created;
    } else {
      const currentByMerchandise = new Map(cart.lines.map((l) => [l.merchandiseId, l]));

      const toRemove = cart.lines.filter((l) => !desired.has(l.merchandiseId)).map((l) => l.id);
      const toUpdate = [...desired.entries()]
        .filter(([merchandiseId, qty]) => currentByMerchandise.has(merchandiseId) && currentByMerchandise.get(merchandiseId)!.quantity !== qty)
        .map(([merchandiseId, quantity]) => ({ id: currentByMerchandise.get(merchandiseId)!.id, quantity }));
      const toAdd: CartLineInput[] = [...desired.entries()]
        .filter(([merchandiseId]) => !currentByMerchandise.has(merchandiseId))
        .map(([merchandiseId, quantity]) => ({ merchandiseId, quantity }));

      if (toRemove.length > 0) {
        const { cart: updated, userErrors } = await cartLinesRemove(cart.id, toRemove);
        if (updated) cart = updated;
        extraWarnings.push(...describeUserErrors(userErrors));
      }
      if (toUpdate.length > 0) {
        const { cart: updated, userErrors } = await cartLinesUpdate(cart.id, toUpdate);
        if (updated) cart = updated;
        extraWarnings.push(...describeUserErrors(userErrors));
      }
      if (toAdd.length > 0) {
        const { cart: updated, userErrors } = await cartLinesAdd(cart.id, toAdd);
        if (updated) cart = updated;
        extraWarnings.push(...describeUserErrors(userErrors));
      }
    }

    // Only re-applied when it actually changed -- a discount code almost never changes between
    // syncs (items do, every time), so this avoids a redundant Storefront API call on every
    // qty +/- click.
    const desiredCodes = input.discountCode ? [input.discountCode] : [];
    const currentCodes = cart.discountCodes.map((d) => d.code);
    const codesChanged = desiredCodes.length !== currentCodes.length || desiredCodes.some((c) => !currentCodes.includes(c));
    if (codesChanged) {
      const { cart: updated, userErrors } = await cartDiscountCodesUpdate(cart.id, desiredCodes);
      if (updated) cart = updated;
      extraWarnings.push(...describeDiscountCodeErrors(userErrors));
    }

    return finalize(cart, input.discountCode, [...warnings, ...extraWarnings]);
  } catch (err) {
    const message =
      err instanceof StorefrontConfigError
        ? "Shopify-varukorgen är inte konfigurerad ännu."
        : "Kunde inte synkronisera varukorgen med Shopify just nu.";
    return emptyResult(input.shopifyCartId, [...warnings, message]);
  }
}
