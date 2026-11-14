import { supabaseService } from "./supabase/service-client";
import { isVariantAvailable } from "./inventory";
import { giftLineVariantGid, isGiftOffer } from "./shopify/gift-line";

export type CartLineInput = { variantId: string; qty: number };

type EligibleVariant = {
  variantId: string;
  productId: string;
  productShopifyId: string;
  productStatus: string;
  price: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
  inventoryTracked: boolean;
  inventoryPolicy: string | null;
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

/** Display-only progress for one active automatic buy-X-get-Y promotion, derived from the exact
 * same unit pools and formulas the pricing loop below uses -- never an input to pricing. Lets the
 * cart show "1/3 smycken" or "1 av 2 gratis smycken" without re-implementing campaign rules
 * client-side. Only present for promotions that were actually eligible to apply to this cart
 * (an exclusive code can keep an automatic promotion out entirely; it then has no entry here). */
export type PromoProgress = {
  discountId: string;
  title: string;
  // "same": buy-set === get-set (e.g. "3 för 2" on jewelry collections) -- every
  // (buyQuantity + getQuantity) qualifying units earn getQuantity free.
  // "split": disjoint buy/get sets (e.g. "Valfritt Smycke": buy a bag, get any piece of jewelry).
  shape: "same" | "split";
  buyQuantity: number;
  getQuantity: number;
  maxApplications: number | null; // uses_per_order_limit
  buyUnits: number; // qualifying "buy" units in the cart (for "same": the shared pool)
  getUnits: number; // qualifying "get" units in the cart (for "same": equals buyUnits)
  applications: number; // how many times the promotion is earned by this cart (after the cap)
  freeUnits: number; // units actually made free
  amountOff: number; // SEK actually discounted by this promotion
};

export type CheckoutTotals = {
  // compareAtPrice: the variant's CURRENT compare-at price from the database (the cart shows it
  // crossed out), so a price changed after the item was added is never shown stale.
  lines: { variantId: string; productId: string; qty: number; unitPrice: number; compareAtPrice?: number | null; lineTotal: number }[];
  subtotal: number;
  appliedDiscounts: AppliedDiscountLine[];
  discountTotal: number;
  vat: number; // from store_settings.vat_rate_percent -- a changeable setting, not a code constant
  shipping: 0; // confirmed real store behavior: always free, no minimum
  total: number;
  errors: string[]; // e.g. invalid code, out of stock -- caller decides whether to block checkout
  // Informational only (never blocks checkout) -- explains when an eligible discount was NOT
  // applied because it isn't combinable with another one that took priority, so the customer
  // isn't left silently wondering why a code/promo they qualify for didn't show up.
  discountNotices: string[];
  // The id of the discount a valid entered code resolved to (if any) -- lets a caller split
  // appliedDiscounts into "automatic promotions" vs "the code I just typed" without guessing
  // from title text, which isn't guaranteed to equal the code string in general.
  codeDiscountId: string | null;
  // variantId -> titles of active BXGY promotions this product/variant is eligible for (e.g.
  // "3 för 2"), independent of whether this cart currently earns a free unit from it. Display
  // only -- never used for pricing. See computeCheckoutTotals for how it's derived.
  eligibleDiscountsByVariant: Record<string, string[]>;
  promoProgress: PromoProgress[];
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
      "id, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy, product_id, products!inner(id, shopify_id, status, collection_products(collections(shopify_id)))"
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
      productStatus: row.products.status,
      price: Number(row.price),
      compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
      inventoryQuantity: row.inventory_quantity,
      inventoryTracked: row.inventory_tracked,
      inventoryPolicy: row.inventory_policy,
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
function cheapestFirst<T extends { price: number }>(expanded: T[]): T[] {
  return [...expanded].sort((a, b) => a.price - b.price);
}

type Unit = { key: number; variantId: string; price: number };

type BxgyResult = {
  shape: "same" | "split";
  freeUnits: Unit[];
  buyUnits: number;
  getUnits: number;
  applications: number;
  amountOff: number;
};

/** One buy-X-get-Y promotion over the given units. Two real shapes exist, handled distinctly
 * because they behave differently: "3 för 2" has buy-set === get-set (the same jewelry
 * collections), so a single qualifying item can't simultaneously count as both a "buy" trigger and
 * the "free" item -- each application genuinely consumes (buy_quantity + get_quantity) units from
 * the shared pool. "Valfritt Smycke" has a disjoint buy-set (bags) and get-set (jewelry), so
 * buy/get units are counted independently. */
function computeBxgy(d: DiscountRow, units: Unit[], variantMap: Map<string, EligibleVariant>): BxgyResult {
  const buySameAsGet =
    d.buy_item_type === d.get_item_type &&
    JSON.stringify([...(d.buy_item_ids ?? [])].sort()) === JSON.stringify([...(d.get_item_ids ?? [])].sort());
  const cap = (applications: number) => (d.uses_per_order_limit != null ? Math.min(applications, d.uses_per_order_limit) : applications);
  const pct = Number(d.get_percentage ?? 0) / 100;
  const result = (shape: "same" | "split", freeUnits: Unit[], buyUnits: number, getUnits: number, applications: number): BxgyResult => ({
    shape,
    freeUnits,
    buyUnits,
    getUnits,
    applications,
    amountOff: Math.round(freeUnits.reduce((sum, u) => sum + u.price * pct, 0) * 100) / 100,
  });

  if (buySameAsGet) {
    const pool = cheapestFirst(units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.buy_item_type, d.buy_item_ids)));
    const applications = cap(Math.floor(pool.length / (d.buy_quantity! + d.get_quantity!)));
    return result("same", pool.slice(0, applications * d.get_quantity!), pool.length, pool.length, applications);
  }
  const buyUnits = units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.buy_item_type, d.buy_item_ids));
  const getUnits = cheapestFirst(units.filter((u) => qualifies(variantMap.get(u.variantId)!, d.get_item_type, d.get_item_ids)));
  const applications = cap(Math.floor(buyUnits.length / d.buy_quantity!));
  return result("split", getUnits.slice(0, applications * d.get_quantity!), buyUnits.length, getUnits.length, applications);
}

/** The bag gift offer is independent of "3 för 2" (see lib/shopify/gift-line.ts): the gift offer
 * picks its free piece first, and every other buy-X-get-Y only sees the remaining units -- so the
 * free piece never counts towards "3 för 2", and both can apply in the same cart. Matches checkout,
 * where the free piece is a separate 0 kr gift line that "3 för 2" can't see. */
function giftFirstBxgy(bxgy: DiscountRow[], units: Unit[], variantMap: Map<string, EligibleVariant>): Map<string, BxgyResult> {
  const results = new Map<string, BxgyResult>();
  const taken = new Set<number>();
  const ordered = [...bxgy.filter((d) => isGiftOffer(d)), ...bxgy.filter((d) => !isGiftOffer(d))];
  for (const d of ordered) {
    const r = computeBxgy(d, units.filter((u) => !taken.has(u.key)), variantMap);
    for (const u of r.freeUnits) taken.add(u.key);
    results.set(d.id, r);
  }
  return results;
}

/** Without a gift line (Shopify's native discounts do everything): Shopify applies only one product
 * discount per item. Each promotion is evaluated on the whole cart on its own; where two want the
 * same unit, the larger discount keeps it and the other simply loses that unit (it doesn't move on
 * to another one). Ties go to the gift offer -- verified against Shopify's own cart (bag + 3
 * jewelry credits the free piece to "Valfritt Smycke"). */
function oneDiscountPerUnitBxgy(bxgy: DiscountRow[], units: Unit[], variantMap: Map<string, EligibleVariant>): Map<string, BxgyResult> {
  const independent = new Map(bxgy.map((d) => [d.id, computeBxgy(d, units, variantMap)]));
  const shapeRank = (d: DiscountRow) => (independent.get(d.id)!.shape === "split" ? 0 : 1);
  const byPriority = [...bxgy].sort(
    (a, b) => independent.get(b.id)!.amountOff - independent.get(a.id)!.amountOff || shapeRank(a) - shapeRank(b)
  );
  const taken = new Set<number>();
  const results = new Map<string, BxgyResult>();
  for (const d of byPriority) {
    const r = independent.get(d.id)!;
    const freeUnits = r.freeUnits.filter((u) => !taken.has(u.key));
    for (const u of freeUnits) taken.add(u.key);
    const pct = Number(d.get_percentage ?? 0) / 100;
    results.set(d.id, { ...r, freeUnits, amountOff: Math.round(freeUnits.reduce((sum, u) => sum + u.price * pct, 0) * 100) / 100 });
  }
  return results;
}

export async function computeCheckoutTotals(
  cart: CartLineInput[],
  discountCode: string | null,
  customerEmail?: string
): Promise<CheckoutTotals> {
  const errors: string[] = [];
  // The three independent reads run in parallel (one database round trip instead of three in a
  // row) -- same data, same calculation below.
  const [variantMap, discounts, vatRatePercent] = await Promise.all([
    loadEligibleVariants(cart.map((c) => c.variantId)),
    loadActiveDiscounts(),
    getVatRatePercent(),
  ]);

  const lines = cart
    .filter((c) => variantMap.has(c.variantId))
    .map((c) => {
      const v = variantMap.get(c.variantId)!;
      if (v.productStatus !== "active") {
        errors.push("En vara i varukorgen är inte längre tillgänglig.");
      } else if (
        !isVariantAvailable(
          { productStatus: v.productStatus, inventoryTracked: v.inventoryTracked, inventoryPolicy: v.inventoryPolicy, inventoryQuantity: v.inventoryQuantity },
          c.qty
        )
      ) {
        errors.push("Otillräckligt lager för en vara i varukorgen.");
      }
      return { variantId: c.variantId, productId: v.productId, qty: c.qty, unitPrice: v.price, compareAtPrice: v.compareAtPrice, lineTotal: v.price * c.qty };
    });
  if (lines.length !== cart.length) errors.push("En eller flera varor i varukorgen kunde inte hittas.");

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  // Expand qty into individual unit entries for per-unit BXGY matching. `key` identifies one
  // physical unit, so two promotions can never both make the same unit free (see below).
  const units: Unit[] = [];
  for (const line of lines) for (let i = 0; i < line.qty; i++) units.push({ key: units.length, variantId: line.variantId, price: line.unitPrice });

  const automatic = discounts.filter((d) => d.kind === "automatic");

  // Which cart variants are eligible for which active BXGY promotion -- display-only, for the
  // cart/checkout UI's per-row "3 för 2" label. Independent of whether this cart currently has
  // enough units to actually earn a free item (that's appliedDiscounts/freeVariantIds below) --
  // this only answers "is this product/variant the kind of item this promotion cares about,"
  // straight from the same real buy/get item lists the actual discount math uses.
  const eligibleDiscountsByVariant: Record<string, string[]> = {};
  for (const d of automatic) {
    if (d.buy_quantity == null || d.get_quantity == null) continue; // only BXGY-style discounts
    for (const [variantId, v] of variantMap) {
      const isEligible = qualifies(v, d.buy_item_type, d.buy_item_ids) || qualifies(v, d.get_item_type, d.get_item_ids);
      if (isEligible) (eligibleDiscountsByVariant[variantId] ??= []).push(d.title);
    }
  }

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

  const discountNotices: string[] = [];
  if (exclusive) {
    for (const d of eligible) {
      if (d.id === exclusive.id) continue;
      discountNotices.push(`"${d.title}" kan inte kombineras med "${exclusive.title}" och har därför inte lagts till.`);
    }
  }

  const appliedDiscounts: AppliedDiscountLine[] = [];
  const promoProgress: PromoProgress[] = [];

  const bxgy = toApply.filter((d) => d.buy_quantity != null && d.get_quantity != null);
  const bxgyResultById = giftLineVariantGid() ? giftFirstBxgy(bxgy, units, variantMap) : oneDiscountPerUnitBxgy(bxgy, units, variantMap);

  for (const d of toApply) {
    const r = bxgyResultById.get(d.id);
    if (r) {
      if (d.kind === "automatic") {
        promoProgress.push({
          discountId: d.id,
          title: d.title,
          shape: r.shape,
          buyQuantity: d.buy_quantity!,
          getQuantity: d.get_quantity!,
          maxApplications: d.uses_per_order_limit,
          buyUnits: r.buyUnits,
          getUnits: r.getUnits,
          applications: r.applications,
          freeUnits: r.freeUnits.length,
          amountOff: r.amountOff,
        });
      }

      if (r.freeUnits.length > 0) {
        appliedDiscounts.push({
          discountId: d.id,
          title: d.title,
          kind: "bxgy_free_item",
          amountOff: r.amountOff,
          freeVariantIds: r.freeUnits.map((u) => u.variantId),
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
  const vat = Math.round(taxableAmount * (vatRatePercent / 100) * 100) / 100;
  const total = Math.round((taxableAmount + vat) * 100) / 100;

  return {
    lines,
    subtotal,
    appliedDiscounts,
    discountTotal,
    vat,
    shipping: 0,
    total,
    errors,
    discountNotices,
    eligibleDiscountsByVariant,
    promoProgress,
    codeDiscountId: codeMatch?.id ?? null,
  };
}
