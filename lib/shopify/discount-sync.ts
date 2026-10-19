import { shopifyGraphQL } from "./client";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/discount-sync.ts must never be imported into client code");
}

// Phase 4: pushes a Jawhara admin discount (supabase/migrations/0001_initial_schema.sql's
// `discounts` table, computed by lib/discounts.ts) into a real, native Shopify discount, so
// Shopify's own hosted checkout (Phase 3) charges the same thing Jawhara's cart displays.
//
// Tracked by `discounts.shopify_discount_id` (full GID) -- deliberately NOT the legacy
// `discounts.shopify_id` column, which holds this row's id from the ORIGINAL Shopify export and
// went stale the same way products/product_variants did before the Phase 2 fix (see that phase's
// investigation): the store's catalog -- and, it turns out, every discount rule id with it -- was
// regenerated at some point, so an old shopify_id can no longer be trusted to name a real,
// current Shopify object. shopify_discount_id instead always names a discount THIS code itself
// created or already confirmed exists, so create-vs-update can never go wrong the same way again.

type DiscountRow = {
  id: string;
  title: string;
  kind: "automatic" | "code";
  code: string | null;
  status: "draft" | "scheduled" | "active" | "expired";
  get_percentage: string | null;
  buy_quantity: number | null;
  buy_item_type: "all" | "product" | "collection" | null;
  buy_item_ids: string[] | null;
  get_quantity: number | null;
  get_item_type: "all" | "product" | "collection" | null;
  get_item_ids: string[] | null;
  combines_with_order: boolean;
  combines_with_product: boolean;
  combines_with_shipping: boolean;
  uses_per_order_limit: number | null;
  usage_limit: number | null;
  applies_once_per_customer: boolean;
  starts_at: string | null;
  ends_at: string | null;
  shopify_discount_id: string | null;
};

export type DiscountSyncResult =
  | { ok: true; action: "created" | "updated" | "deactivated" | "skipped"; shopifyDiscountId: string | null; warnings: string[] }
  | { ok: false; error: string };

type ItemsInput = { all: true } | { productIds: string[] } | { collectionIds: string[] };

async function markSynced(
  discountId: string,
  shopifyDiscountId: string | null,
  status: "synced" | "error",
  error: string | null
): Promise<void> {
  await supabaseService
    .from("discounts")
    .update({
      shopify_discount_id: shopifyDiscountId,
      shopify_sync_status: status,
      shopify_sync_error: error,
      shopify_synced_at: new Date().toISOString(),
    })
    .eq("id", discountId);
}

// In-memory per-process cache: collection handle -> live Shopify Collection GID. Handles are
// stable identifiers (same assumption Phase 2's product/variant remap relied on); re-resolving
// per sync call would otherwise mean 20 extra Admin API round-trips for "3 för 2" alone on every
// single discount edit.
const collectionGidByHandle = new Map<string, string | null>();

async function resolveCollectionGid(handle: string): Promise<string | null> {
  if (collectionGidByHandle.has(handle)) return collectionGidByHandle.get(handle)!;
  const data = await shopifyGraphQL<{ collectionByHandle: { id: string } | null }>(
    `query($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { h: handle }
  );
  const gid = data.collectionByHandle?.id ?? null;
  collectionGidByHandle.set(handle, gid);
  return gid;
}

/**
 * Translates a buy_item_type/buy_item_ids (or get_*) pair -- stored against the legacy, now-stale
 * `products.shopify_id`/`collections.shopify_id` scheme lib/discounts.ts's own qualifies() still
 * (correctly, for Jawhara's own pricing) reads -- into the real, current Shopify GIDs the
 * discount mutations need. Never throws on an unresolvable id: it's dropped with a warning
 * (surfaced to the admin, never silent) rather than failing the whole sync over one bad reference
 * (e.g. a product since deleted from Shopify but not yet cleaned up in this discount's item list).
 */
async function resolveItems(itemType: "all" | "product" | "collection" | null, legacyIds: string[] | null): Promise<{ items: ItemsInput; warnings: string[] }> {
  if (itemType === "all" || itemType === null) return { items: { all: true }, warnings: [] };
  const ids = legacyIds ?? [];
  if (ids.length === 0) return { items: { all: true }, warnings: ["Inga varor/kollektioner angivna -- behandlas som hela ordern."] };

  if (itemType === "product") {
    const { data } = await supabaseService.from("products").select("shopify_id, shopify_product_id, title").in("shopify_id", ids);
    const byLegacyId = new Map((data ?? []).map((r) => [r.shopify_id as string, r]));
    const productIds: string[] = [];
    const warnings: string[] = [];
    for (const legacyId of ids) {
      const row = byLegacyId.get(legacyId);
      if (!row?.shopify_product_id) {
        warnings.push(`En produkt (${row?.title ?? legacyId}) kunde inte matchas mot en aktuell Shopify-produkt och exkluderades.`);
        continue;
      }
      productIds.push(row.shopify_product_id);
    }
    return { items: { productIds }, warnings };
  }

  // collection
  const { data } = await supabaseService.from("collections").select("shopify_id, handle, title").in("shopify_id", ids);
  const warnings: string[] = [];
  const gids = await Promise.all(
    (data ?? []).map(async (row) => {
      const gid = await resolveCollectionGid(row.handle);
      if (!gid) warnings.push(`En kollektion ("${row.title}") kunde inte matchas mot en aktuell Shopify-kollektion och exkluderades.`);
      return gid;
    })
  );
  const foundLegacyIds = new Set((data ?? []).map((r) => r.shopify_id as string));
  for (const legacyId of ids) {
    if (!foundLegacyIds.has(legacyId)) warnings.push(`En kollektion (${legacyId}) fanns inte i Supabase och exkluderades.`);
  }
  return { items: { collectionIds: gids.filter((g): g is string => !!g) }, warnings };
}

function itemsToDiscountItemsInput(items: ItemsInput): Record<string, unknown> {
  if ("all" in items) return { all: true };
  if ("productIds" in items) return { products: { productsToAdd: items.productIds } };
  return { collections: { add: items.collectionIds } };
}

function combinesWithInput(d: DiscountRow) {
  return {
    orderDiscounts: d.combines_with_order,
    productDiscounts: d.combines_with_product,
    shippingDiscounts: d.combines_with_shipping,
  };
}

type MutationOutcome = { shopifyDiscountId: string | null; userErrors: { message: string }[] };

async function createOrUpdateAutomaticBxgy(d: DiscountRow, buyItems: ItemsInput, getItems: ItemsInput): Promise<MutationOutcome> {
  const input = {
    title: d.title,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    combinesWith: combinesWithInput(d),
    context: { all: "ALL" },
    usesPerOrderLimit: d.uses_per_order_limit != null ? String(d.uses_per_order_limit) : null,
    customerBuys: { value: { quantity: String(d.buy_quantity) }, items: itemsToDiscountItemsInput(buyItems) },
    customerGets: {
      value: { discountOnQuantity: { quantity: String(d.get_quantity), effect: { percentage: Number(d.get_percentage ?? 0) / 100 } } },
      items: itemsToDiscountItemsInput(getItems),
    },
  };
  if (d.shopify_discount_id) {
    const data = await shopifyGraphQL<{ discountAutomaticBxgyUpdate: { automaticDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation($id: ID!, $input: DiscountAutomaticBxgyInput!) {
        discountAutomaticBxgyUpdate(id: $id, automaticBxgyDiscount: $input) {
          automaticDiscountNode { id }
          userErrors { message }
        }
      }`,
      { id: d.shopify_discount_id, input }
    );
    return { shopifyDiscountId: data.discountAutomaticBxgyUpdate.automaticDiscountNode?.id ?? d.shopify_discount_id, userErrors: data.discountAutomaticBxgyUpdate.userErrors };
  }
  const data = await shopifyGraphQL<{ discountAutomaticBxgyCreate: { automaticDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($input: DiscountAutomaticBxgyInput!) {
      discountAutomaticBxgyCreate(automaticBxgyDiscount: $input) {
        automaticDiscountNode { id }
        userErrors { message }
      }
    }`,
    { input }
  );
  return { shopifyDiscountId: data.discountAutomaticBxgyCreate.automaticDiscountNode?.id ?? null, userErrors: data.discountAutomaticBxgyCreate.userErrors };
}

async function createOrUpdateCodeBxgy(d: DiscountRow, buyItems: ItemsInput, getItems: ItemsInput): Promise<MutationOutcome> {
  const input = {
    title: d.title,
    code: d.code,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    combinesWith: combinesWithInput(d),
    context: { all: "ALL" },
    usesPerOrderLimit: d.uses_per_order_limit,
    usageLimit: d.usage_limit,
    appliesOncePerCustomer: d.applies_once_per_customer,
    customerBuys: { value: { quantity: String(d.buy_quantity) }, items: itemsToDiscountItemsInput(buyItems) },
    customerGets: {
      value: { discountOnQuantity: { quantity: String(d.get_quantity), effect: { percentage: Number(d.get_percentage ?? 0) / 100 } } },
      items: itemsToDiscountItemsInput(getItems),
    },
  };
  if (d.shopify_discount_id) {
    const data = await shopifyGraphQL<{ discountCodeBxgyUpdate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation($id: ID!, $input: DiscountCodeBxgyInput!) {
        discountCodeBxgyUpdate(id: $id, bxgyCodeDiscount: $input) {
          codeDiscountNode { id }
          userErrors { message }
        }
      }`,
      { id: d.shopify_discount_id, input }
    );
    return { shopifyDiscountId: data.discountCodeBxgyUpdate.codeDiscountNode?.id ?? d.shopify_discount_id, userErrors: data.discountCodeBxgyUpdate.userErrors };
  }
  const data = await shopifyGraphQL<{ discountCodeBxgyCreate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($input: DiscountCodeBxgyInput!) {
      discountCodeBxgyCreate(bxgyCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { message }
      }
    }`,
    { input }
  );
  return { shopifyDiscountId: data.discountCodeBxgyCreate.codeDiscountNode?.id ?? null, userErrors: data.discountCodeBxgyCreate.userErrors };
}

async function createOrUpdateAutomaticBasic(d: DiscountRow): Promise<MutationOutcome> {
  const input = {
    title: d.title,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    combinesWith: combinesWithInput(d),
    context: { all: "ALL" },
    customerGets: { value: { percentage: Number(d.get_percentage ?? 0) / 100 }, items: { all: true } },
  };
  if (d.shopify_discount_id) {
    const data = await shopifyGraphQL<{ discountAutomaticBasicUpdate: { automaticDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation($id: ID!, $input: DiscountAutomaticBasicInput!) {
        discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $input) {
          automaticDiscountNode { id }
          userErrors { message }
        }
      }`,
      { id: d.shopify_discount_id, input }
    );
    return { shopifyDiscountId: data.discountAutomaticBasicUpdate.automaticDiscountNode?.id ?? d.shopify_discount_id, userErrors: data.discountAutomaticBasicUpdate.userErrors };
  }
  const data = await shopifyGraphQL<{ discountAutomaticBasicCreate: { automaticDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($input: DiscountAutomaticBasicInput!) {
      discountAutomaticBasicCreate(automaticBasicDiscount: $input) {
        automaticDiscountNode { id }
        userErrors { message }
      }
    }`,
    { input }
  );
  return { shopifyDiscountId: data.discountAutomaticBasicCreate.automaticDiscountNode?.id ?? null, userErrors: data.discountAutomaticBasicCreate.userErrors };
}

async function createOrUpdateCodeBasic(d: DiscountRow): Promise<MutationOutcome> {
  const input = {
    title: d.title,
    code: d.code,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    combinesWith: combinesWithInput(d),
    context: { all: "ALL" },
    usageLimit: d.usage_limit,
    appliesOncePerCustomer: d.applies_once_per_customer,
    customerGets: { value: { percentage: Number(d.get_percentage ?? 0) / 100 }, items: { all: true } },
  };
  if (d.shopify_discount_id) {
    const data = await shopifyGraphQL<{ discountCodeBasicUpdate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation($id: ID!, $input: DiscountCodeBasicInput!) {
        discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
          codeDiscountNode { id }
          userErrors { message }
        }
      }`,
      { id: d.shopify_discount_id, input }
    );
    return { shopifyDiscountId: data.discountCodeBasicUpdate.codeDiscountNode?.id ?? d.shopify_discount_id, userErrors: data.discountCodeBasicUpdate.userErrors };
  }
  const data = await shopifyGraphQL<{ discountCodeBasicCreate: { codeDiscountNode: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { message }
      }
    }`,
    { input }
  );
  return { shopifyDiscountId: data.discountCodeBasicCreate.codeDiscountNode?.id ?? null, userErrors: data.discountCodeBasicCreate.userErrors };
}

/** Raw deactivate against Shopify, no Supabase read/write of its own -- used both by the normal
 * sync flow (which wraps this with markSynced) and by deleteDiscount/bulkDeleteDiscounts, which
 * deactivate the Shopify side right before/after removing a row that won't exist to update
 * afterward. Deactivating (never deleting) the Shopify object on a Jawhara delete keeps the same
 * "reversible, visible in Shopify" property described on syncDiscountToShopify above. */
export async function deactivateShopifyDiscount(kind: "automatic" | "code", shopifyDiscountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mutation =
      kind === "automatic"
        ? `mutation($id: ID!) { discountAutomaticDeactivate(id: $id) { userErrors { message } } }`
        : `mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`;
    const data = await shopifyGraphQL<any>(mutation, { id: shopifyDiscountId });
    const userErrors = kind === "automatic" ? data.discountAutomaticDeactivate.userErrors : data.discountCodeDeactivate.userErrors;
    if (userErrors?.length) return { ok: false, error: userErrors.map((e: { message: string }) => e.message).join("; ") };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel." };
  }
}

async function deactivate(d: DiscountRow): Promise<DiscountSyncResult> {
  const result = await deactivateShopifyDiscount(d.kind, d.shopify_discount_id!);
  if (!result.ok) {
    await markSynced(d.id, d.shopify_discount_id, "error", result.error);
    return { ok: false, error: result.error };
  }
  await markSynced(d.id, d.shopify_discount_id, "synced", null);
  return { ok: true, action: "deactivated", shopifyDiscountId: d.shopify_discount_id, warnings: [] };
}

/**
 * Pushes one Jawhara discount row into Shopify: creates it (first time 'active'/'scheduled'),
 * updates it in place (already has a shopify_discount_id), or deactivates it (Jawhara turned it
 * off/expired it and a Shopify counterpart exists) -- never deletes a Shopify discount outright,
 * so disabling from Jawhara is always reversible on the Shopify side too. A pure 'draft' that's
 * never been synced is skipped entirely: it has nothing to disable.
 *
 * Never throws. Every outcome -- success, a Shopify userError, or a transport failure -- is
 * written to discounts.shopify_sync_status/shopify_sync_error/shopify_synced_at and returned, so
 * the admin UI always has an accurate, current picture (see app/admin/.../discounts/[id]/page.tsx).
 */
export async function syncDiscountToShopify(discountId: string): Promise<DiscountSyncResult> {
  const { data: d, error } = await supabaseService.from("discounts").select("*").eq("id", discountId).single();
  if (error || !d) return { ok: false, error: "Rabatten kunde inte hittas." };
  const row = d as DiscountRow;

  const isLive = row.status === "active" || row.status === "scheduled";
  if (!isLive) {
    if (!row.shopify_discount_id) return { ok: true, action: "skipped", shopifyDiscountId: null, warnings: [] };
    return deactivate(row);
  }

  const isBxgy = row.buy_quantity != null && row.get_quantity != null;

  try {
    let warnings: string[] = [];
    let outcome: MutationOutcome;

    if (isBxgy) {
      const [buy, get] = await Promise.all([resolveItems(row.buy_item_type, row.buy_item_ids), resolveItems(row.get_item_type, row.get_item_ids)]);
      warnings = [...buy.warnings, ...get.warnings];
      outcome = row.kind === "automatic" ? await createOrUpdateAutomaticBxgy(row, buy.items, get.items) : await createOrUpdateCodeBxgy(row, buy.items, get.items);
    } else {
      outcome = row.kind === "automatic" ? await createOrUpdateAutomaticBasic(row) : await createOrUpdateCodeBasic(row);
    }

    if (outcome.userErrors.length > 0) {
      const message = outcome.userErrors.map((e) => e.message).join("; ");
      await markSynced(row.id, outcome.shopifyDiscountId ?? row.shopify_discount_id, "error", message);
      return { ok: false, error: message };
    }
    if (!outcome.shopifyDiscountId) {
      const message = "Shopify returnerade inget rabatt-id.";
      await markSynced(row.id, row.shopify_discount_id, "error", message);
      return { ok: false, error: message };
    }

    await markSynced(row.id, outcome.shopifyDiscountId, "synced", warnings.length > 0 ? warnings.join(" ") : null);
    return { ok: true, action: row.shopify_discount_id ? "updated" : "created", shopifyDiscountId: outcome.shopifyDiscountId, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Okänt fel.";
    await markSynced(row.id, row.shopify_discount_id, "error", message);
    return { ok: false, error: "Kunde inte synkronisera rabatten med Shopify just nu." };
  }
}

/** One Swedish line for the admin UI's non-blocking banner, or null when there's nothing to say
 * (synced cleanly with no warnings, or correctly skipped). Never thrown/blocks the caller's own
 * save -- this phase treats the Shopify side as best-effort, same as every other Shopify sync in
 * this codebase (see e.g. lib/shopify/cart-sync.ts). */
export function describeDiscountSyncResult(result: DiscountSyncResult): string | null {
  if (!result.ok) return `Kunde inte synka med Shopify: ${result.error}`;
  if (result.warnings.length > 0) return `Synkad till Shopify, men: ${result.warnings.join(" ")}`;
  return null;
}
