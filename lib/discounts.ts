import { supabaseService } from "./supabase/service-client";

export type CartLineInput = { variantId: string; qty: number };

type EligibleVariant = {
  variantId: string;
  productId: string;
  productShopifyId: string;
  price: number;
  inventoryQuantity: number;
  collectionShopifyIds: string[];
};

type DiscountRow = {
  id: string;
  title: string;
  kind: string;
  code: string | null;
  status: string;
  value_type: string | null;
  value: string | null;
  buy_quantity: number | null;
  buy_item_type: string | null;
  buy_item_ids: string[] | null;
  get_quantity: number | null;
  get_percentage: string | null;
  get_item_type: string | null;
  get_item_ids: string[] | null;
  combines_with_order: boolean;
  combines_with_product: boolean;
  combines_with_shipping: boolean;
  uses_per_order_limit: number | null;
  usage_limit: number | null;
  applies_once_per_customer: boolean;
};

export type AppliedDiscountLine = {
  discountId: string;
  title: string;
  kind: "order_percentage" | "bxgy_free_item";
  amountOff: number; // SEK, positive
  freeVariantIds?: string[]; // which cart variant lines got a free unit (bxgy only)
};

export type CheckoutTotals = {
  lines: { variantId: string; productId: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  appliedDiscounts: AppliedDiscountLine[];
  discountTotal: number;
  vat: number; // from store_settings.vat_rate_percent -- a changeable setting, not a code constant
  shipping: 0; // confirmed real store behavior: always free, no minimum
  total: number;
  errors: string[]; // e.g. invalid code, out of stock -- caller decides whether to block checkout
};

/**
 * Single global VAT rate applied to the subtotal, not per-product -- there's no trustworthy
 * per-product tax rate in the real Shopify data to differentiate on (only a binary `taxable`
 * flag, inconsistently used in just 42/788 variants and 2/286 real orders). Defaults to 0% (the
 * explicit user decision of 2026-10-10) if the setting row is ever missing.
 */
async function getVatRatePercent(): Promise<number> {
  const { data } = await supabaseService.from("store_settings").select("value").eq("key", "vat_rate_percent").single();
  return Number(data?.value ?? 0);
}

/** Re-fetches real price/inventory/collection-membership from Supabase -- never trusts client-supplied values. */
async function loadEligibleVariants(variantIds: string[]): Promise<Map<string, EligibleVariant>> {
  const { data, error } = await supabaseService
    .from("product_variants")
    .select(
      "id, price, inventory_quantity, product_id, products!inner(id, shopify_id, collection_products(collections(shopify_id)))"
    )
    .in("id", variantIds);

  if (error || !data) return new Map();

  const map = new Map<string, EligibleVariant>();
  for (const row of data as any[]) {
    const collectionShopifyIds: string[] = (row.products.collection_products ?? [])
      .map((cp: any) => cp.collections?.shopify_id)
      .filter(Boolean);
    map.set(row.id, {
      variantId: row.id,
      productId: row.product_id,
      productShopifyId: row.products.shopify_id,
      price: Number(row.price),
      inventoryQuantity: row.inventory_quantity,
      collectionShopifyIds,
    });
  }
  return map;
}

async function loadActiveDiscounts(): Promise<DiscountRow[]> {
  const { data } = await supabaseService.from("discounts").select("*").eq("status", "active");
  return (data as DiscountRow[]) ?? [];
}

async function redemptionCounts(discountId: string, customerEmail?: string) {
  const { count: totalCount } = await supabaseService
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("discount_id", discountId);

  let customerCount = 0;
  if (customerEmail) {
    const { count } = await supabaseService
      .from("discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_id", discountId)
      .eq("customer_email", customerEmail);
    customerCount = count ?? 0;
  }
  return { totalCount: totalCount ?? 0, customerCount };
}

function qualifies(variant: EligibleVariant, itemType: string | null, itemIds: string[] | null): boolean {
  if (itemType === "all" || itemType === null) return itemType === "all"; // "all" = every item; null = not an item-scoped discount
  if (itemType === "product") return itemIds?.includes(variant.productShopifyId) ?? false;
  if (itemType === "collection") return variant.collectionShopifyIds.some((c) => itemIds?.includes(c));
  return false;
}

/** Cheapest-first, matching Shopify's own documented BXGY behavior (discount applies to the customer's cheapest eligible item). */
function cheapestFirst(expanded: { variantId: string; price: number }[]): { variantId: string; price: number }[] {
  return [...expanded].sort((a, b) => a.price - b.price);
}

export async function computeCheckoutTotals(
  cart: CartLineInput[],
  discountCode: string | null,
  customerEmail?: string
): Promise<CheckoutTotals> {
  const errors: string[] = [];
  const variantMap = await loadEligibleVariants(cart.map((c) => c.variantId));

  const lines = cart
    .filter((c) => variantMap.has(c.variantId))
    .map((c) => {
      const v = variantMap.get(c.variantId)!;
      if (v.inventoryQuantity < c.qty) errors.push(`Otillräckligt lager för en vara i varukorgen.`);
      return { variantId: c.variantId, productId: v.productId, qty: c.qty, unitPrice: v.price, lineTotal: v.price * c.qty };
    });
  if (lines.length !== cart.length) errors.push("En eller flera varor i varukorgen kunde inte hittas.");

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  // Expand qty into individual unit entries for per-unit BXGY matching.
  const units: { variantId: string; price: number }[] = [];
  for (const line of lines) for (let i = 0; i < line.qty; i++) units.push({ variantId: line.variantId, price: line.unitPrice });

  const discounts = await loadActiveDiscounts();
  const automatic = discounts.filter((d) => d.kind === "automatic");
  const codeMatch = discountCode
    ? discounts.find((d) => d.kind === "code" && d.code?.toLowerCase() === discountCode.trim().toLowerCase())
    : undefined;
  if (discountCode && !codeMatch) errors.push(`Rabattkoden "${discountCode}" är ogiltig eller har gått ut.`);

  const candidates: DiscountRow[] = [...automatic];
  if (codeMatch) candidates.push(codeMatch);

  // Usage-limit / once-per-customer pre-check (final authoritative check happens again in the
  // webhook before an order is confirmed, same pattern as inventory oversell prevention).
  const eligible: DiscountRow[] = [];
  for (const d of candidates) {
    if (d.usage_limit != null || d.applies_once_per_customer) {
      const { totalCount, customerCount } = await redemptionCounts(d.id, customerEmail);
      if (d.usage_limit != null && totalCount >= d.usage_limit) {
        if (d.id === codeMatch?.id) errors.push(`Rabattkoden "${discountCode}" har redan använts max antal gånger.`);
        continue;
      }
      if (d.applies_once_per_customer && customerEmail && customerCount > 0) {
        if (d.id === codeMatch?.id) errors.push(`Rabattkoden "${discountCode}" kan bara användas en gång per kund.`);
        continue;
      }
    }
    eligible.push(d);
  }

  // Exclusivity: a discount whose own combinesWith is false on order/product stacking is exclusive --
  // if present, nothing else applies alongside it (mirrors Shopify's own "both sides must agree" rule,
  // simplified since only one code can be entered at a time in this checkout).
  const exclusive = eligible.find((d) => !d.combines_with_order || !d.combines_with_product);
  const toApply = exclusive ? [exclusive] : eligible;

  const appliedDiscounts: AppliedDiscountLine[] = [];

  for (const d of toApply) {
    if (d.buy_quantity != null && d.get_quantity != null) {
      // BXGY. Two real shapes exist among the 6 actual discounts, handled distinctly because
      // they behave differently: "3 för 2"/"6 för 4" have buy-set === get-set (the same jewelry
      // collections), so a single qualifying item can't simultaneously count as both a "buy"
      // trigger and the "free" item -- each application genuinely consumes
      // (buy_quantity + get_quantity) units from the shared pool. "Valfri Plånbok" has a
      // disjoint buy-set (bags) and get-set (wallets), so buy/get units are counted independently.
      const buySameAsGet =
        d.buy_item_type === d.get_item_type &&
        JSON.stringify([...(d.buy_item_ids ?? [])].sort()) === JSON.stringify([...(d.get_item_ids ?? [])].sort());

      let freeUnits: { variantId: string; price: number }[] = [];

      if (buySameAsGet) {
        const pool = cheapestFirst(units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.buy_item_type, d.buy_item_ids)));
        const groupSize = d.buy_quantity + d.get_quantity;
        const applications = Math.floor(pool.length / groupSize);
        const capped = d.uses_per_order_limit != null ? Math.min(applications, d.uses_per_order_limit) : applications;
        freeUnits = pool.slice(0, capped * d.get_quantity);
      } else {
        const buyUnits = units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.buy_item_type, d.buy_item_ids));
        const getUnits = cheapestFirst(units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.get_item_type, d.get_item_ids)));
        const applications = Math.floor(buyUnits.length / d.buy_quantity!);
        const capped = d.uses_per_order_limit != null ? Math.min(applications, d.uses_per_order_limit) : applications;
        freeUnits = getUnits.slice(0, capped * d.get_quantity);
      }

      if (freeUnits.length > 0) {
        const pct = Number(d.get_percentage ?? 0) / 100;
        const amountOff = freeUnits.reduce((sum, u) => sum + u.price * pct, 0);
        appliedDiscounts.push({
          discountId: d.id,
          title: d.title,
          kind: "bxgy_free_item",
          amountOff: Math.round(amountOff * 100) / 100,
          freeVariantIds: freeUnits.map((u) => u.variantId),
        });
      }
    } else if (d.get_percentage != null) {
      // Order-level percentage off (all 3 real codes apply to the whole order -- items.allItems=true).
      const pct = Number(d.get_percentage) / 100;
      const amountOff = Math.round(subtotal * pct * 100) / 100;
      if (amountOff > 0) {
        appliedDiscounts.push({ discountId: d.id, title: d.title, kind: "order_percentage", amountOff });
      }
    }
  }

  const discountTotal = Math.round(appliedDiscounts.reduce((sum, a) => sum + a.amountOff, 0) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const vatRatePercent = await getVatRatePercent();
  const vat = Math.round(taxableAmount * (vatRatePercent / 100) * 100) / 100;
  const total = Math.round((taxableAmount + vat) * 100) / 100;

  return { lines, subtotal, appliedDiscounts, discountTotal, vat, shipping: 0, total, errors };
}
