import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { parseProductsListFilters, applyProductsListFilters } from "@/lib/admin/products-filters";

const LOW_STOCK_THRESHOLD = 5;

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseProductsListFilters(sp);

  // Same collectionId/stockLevel -> baseIds resolution as app/admin/(authenticated)/products/page.tsx,
  // so a filtered export always matches what the admin is currently looking at.
  let baseIds: string[] | undefined;
  if (filters.collectionId) {
    const { data } = await supabaseService.from("collection_products").select("product_id").eq("collection_id", filters.collectionId);
    baseIds = (data ?? []).map((r) => r.product_id);
  }
  if (filters.stockLevel) {
    let variantQuery = supabaseService.from("product_variants").select("product_id, inventory_quantity, inventory_tracked");
    if (filters.stockLevel === "untracked") variantQuery = variantQuery.eq("inventory_tracked", false);
    else variantQuery = variantQuery.eq("inventory_tracked", true).lte("inventory_quantity", filters.stockLevel === "out" ? 0 : LOW_STOCK_THRESHOLD);
    const { data } = await variantQuery;
    const stockIds = new Set((data ?? []).map((r) => r.product_id));
    baseIds = baseIds ? baseIds.filter((id) => stockIds.has(id)) : Array.from(stockIds);
  }

  let query = supabaseService
    .from("products")
    .select(
      "handle, title, vendor, product_type, tags, status, source, template_suffix, seo_title, seo_description, description_html, " +
        "media(storage_path, position), " +
        "product_variants(sku, barcode, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy, weight, weight_unit, option1, option2, option3)"
    );
  query = applyProductsListFilters(query as any, filters, baseIds);
  const { data: products } = await query;

  const header = [
    "Handle",
    "Title",
    "Vendor",
    "Product Type",
    "Tags",
    "Status",
    "Source",
    "Template Suffix",
    "SEO Title",
    "SEO Description",
    "Body HTML",
    "Image Src",
    "Option1 Value",
    "Option2 Value",
    "Option3 Value",
    "Variant SKU",
    "Variant Barcode",
    "Variant Price",
    "Variant Compare At Price",
    "Variant Inventory Qty",
    "Variant Inventory Tracked",
    "Variant Inventory Policy",
    "Variant Weight",
    "Variant Weight Unit",
  ];

  const rows: unknown[][] = [];
  let variantCount = 0;
  for (const p of (products ?? []) as any[]) {
    const variants = p.product_variants?.length ? p.product_variants : [{}];
    const sortedMedia = [...(p.media ?? [])].sort((a: any, b: any) => a.position - b.position);
    const imageSrc = sortedMedia[0]?.storage_path ?? "";

    variants.forEach((v: any, i: number) => {
      variantCount++;
      rows.push([
        p.handle,
        i === 0 ? p.title : "",
        i === 0 ? p.vendor ?? "" : "",
        i === 0 ? p.product_type ?? "" : "",
        i === 0 ? (p.tags ?? []).join(", ") : "",
        i === 0 ? p.status : "",
        i === 0 ? p.source : "",
        i === 0 ? p.template_suffix ?? "" : "",
        i === 0 ? p.seo_title ?? "" : "",
        i === 0 ? p.seo_description ?? "" : "",
        i === 0 ? p.description_html ?? "" : "",
        i === 0 ? imageSrc : "",
        v.option1 ?? "",
        v.option2 ?? "",
        v.option3 ?? "",
        v.sku ?? "",
        v.barcode ?? "",
        v.price ?? "",
        v.compare_at_price ?? "",
        v.inventory_quantity ?? "",
        v.inventory_tracked ?? "",
        v.inventory_policy ?? "",
        v.weight ?? "",
        v.weight_unit ?? "",
      ]);
    });
  }

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  await logAdminAction(admin.adminId, "products.export_csv", undefined, undefined, { filters, productCount: products?.length ?? 0, variantCount });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jawhara-produkter-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
