import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { getDiscountStats } from "@/lib/admin/discount-stats";
import { DiscountForm, type DiscountFormInitial } from "@/components/admin/discount-form";
import { DiscountRedemptionsCard } from "@/components/admin/discount-redemptions-card";
import type { PickerItem } from "@/components/admin/discount-item-picker";

export const dynamic = "force-dynamic";

async function resolveItems(itemType: string | null, itemIds: string[] | null): Promise<PickerItem[]> {
  if (!itemIds || itemIds.length === 0) return [];
  const table = itemType === "collection" ? "collections" : "products";
  const { data } = await supabaseService.from(table).select("title, shopify_id").in("shopify_id", itemIds);
  const byShopifyId = new Map((data ?? []).map((row) => [row.shopify_id as string, row.title as string]));
  return itemIds.map((id) => ({ shopifyId: id, title: byShopifyId.get(id) ?? `(okänt, Shopify-ID ${id})` }));
}

export default async function AdminDiscountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();

  const { data: discount } = await supabase.from("discounts").select("*").eq("id", id).maybeSingle();
  if (!discount) notFound();

  const [buyItems, getItems, { data: collectionRows }, stats] = await Promise.all([
    resolveItems(discount.buy_item_type, discount.buy_item_ids),
    resolveItems(discount.get_item_type, discount.get_item_ids),
    supabase.from("collections").select("title, shopify_id").not("shopify_id", "is", null).order("title"),
    getDiscountStats(id),
  ]);

  const allCollections: PickerItem[] = (collectionRows ?? []).map((c) => ({ shopifyId: c.shopify_id as string, title: c.title }));

  const initial: DiscountFormInitial = {
    title: discount.title ?? "",
    kind: discount.kind,
    code: discount.code,
    status: discount.status,
    getPercentage: discount.get_percentage != null ? Number(discount.get_percentage) : null,
    buyQuantity: discount.buy_quantity,
    buyItemType: discount.buy_item_type,
    buyItems,
    getQuantity: discount.get_quantity,
    getItemType: discount.get_item_type,
    getItems,
    combinesWithOrder: discount.combines_with_order,
    combinesWithProduct: discount.combines_with_product,
    combinesWithShipping: discount.combines_with_shipping,
    usesPerOrderLimit: discount.uses_per_order_limit,
    usageLimit: discount.usage_limit,
    appliesOncePerCustomer: discount.applies_once_per_customer,
    startsAt: discount.starts_at,
    endsAt: discount.ends_at,
  };

  return (
    <div className="max-w-3xl">
      <Link href="/admin/discounts" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Rabatter
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">{discount.title}</h1>

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Shopify-synk</div>
          {discount.shopify_discount_id ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${discount.shopify_sync_status === "error" ? "bg-rose-500" : "bg-emerald-500"}`} />
                <span className="font-medium text-gray-900">{discount.shopify_sync_status === "error" ? "Fel vid senaste synk" : "Synkad"}</span>
              </div>
              <div className="text-xs text-gray-400">
                Shopify-id: {discount.shopify_discount_id}
                {discount.shopify_synced_at && ` · ${new Date(discount.shopify_synced_at).toLocaleString("sv-SE")}`}
              </div>
              {discount.shopify_sync_error && <div className="text-xs text-rose-600">{discount.shopify_sync_error}</div>}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Inte synkad till Shopify ännu{discount.status === "draft" ? " (utkast -- synkas när du aktiverar eller schemalägger den)." : "."}
            </p>
          )}
        </div>
        <DiscountForm discountId={id} initial={initial} allCollections={allCollections} />
        <DiscountRedemptionsCard stats={stats} />
      </div>
    </div>
  );
}
