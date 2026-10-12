import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { mediaUrl } from "@/lib/supabase/media";
import { requireAdmin } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";
import { getProductDeleteImpact } from "@/lib/admin/product-delete-impact";
import { ProductCoreForm } from "@/components/admin/product-core-form";
import { ProductSeoForm } from "@/components/admin/product-seo-form";
import { ProductVariantsTable } from "@/components/admin/product-variants-table";
import { ProductMediaManager } from "@/components/admin/product-media-manager";
import { ProductComplementaryManager } from "@/components/admin/product-complementary-manager";
import { ProductSidebarActions } from "@/components/admin/product-sidebar-actions";
import { VariantStockHistory } from "@/components/admin/variant-stock-history";
import { FulfillmentProductDetail } from "@/components/admin/fulfillment-product-detail";

export const dynamic = "force-dynamic";

export default async function AdminProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant: highlightVariantId } = await searchParams;
  const admin = await requireAdmin();
  const isFulfillmentStaff = admin.role === "fulfillment_staff";
  const locale = admin.locale;
  const supabase = await createAuthServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, title, handle, status, vendor, product_type, description_html, tags, seo_title, seo_description, template_suffix, source")
    .eq("id", id)
    .maybeSingle();
  if (!product) {
    if (isFulfillmentStaff) {
      return (
        <div className="max-w-6xl">
          <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
            {t(locale, "product.back")}
          </Link>
          <p className="mt-4 text-sm text-gray-500">{t(locale, "product.notFound")}</p>
        </div>
      );
    }
    notFound();
  }

  const [{ data: variants }, { data: media }, { data: templates }, deleteImpact, { data: complementary }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, title, sku, barcode, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy, weight, weight_unit, option1, option2, option3")
      .eq("product_id", id)
      .order("created_at"),
    supabase.from("media").select("id, storage_path, alt_text, variant_id, position").eq("product_id", id).order("position"),
    supabase.from("product_templates").select("key, name").order("name"),
    getProductDeleteImpact(id),
    supabase
      .from("product_complementary")
      .select("complementary_product_id, products!product_complementary_complementary_product_id_fkey(id, title, media(storage_path, position))")
      .eq("product_id", id)
      .order("position"),
  ]);

  const complementaryItems = (complementary ?? []).map((row: any) => {
    const sortedMedia = [...(row.products?.media ?? [])].sort((a: any, b: any) => a.position - b.position);
    return {
      id: row.products.id,
      title: row.products.title,
      thumbnailUrl: sortedMedia[0] ? mediaUrl(sortedMedia[0].storage_path) : null,
    };
  });

  const variantOptions = (variants ?? []).map((v) => ({
    id: v.id,
    label: [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || v.title,
  }));

  if (isFulfillmentStaff) {
    const images = [...(media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ id: m.id, url: mediaUrl(m.storage_path) }));
    const plainDescription = product.description_html ? product.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
    return (
      <div className="max-w-6xl">
        <div className="mb-6">
          <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
            {t(locale, "product.back")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{product.title}</h1>
        </div>
        <FulfillmentProductDetail
          images={images}
          description={plainDescription}
          variants={(variants ?? []).map((v) => ({
            id: v.id,
            sku: v.sku,
            price: Number(v.price),
            inventoryQuantity: v.inventory_quantity,
            inventoryTracked: v.inventory_tracked,
            inventoryPolicy: v.inventory_policy,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
          }))}
          highlightVariantId={highlightVariantId}
          locale={locale}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
          ← Produkter
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{product.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <ProductCoreForm
            productId={product.id}
            initial={{
              title: product.title,
              vendor: product.vendor,
              productType: product.product_type,
              descriptionHtml: product.description_html,
              tags: product.tags ?? [],
              templateSuffix: product.template_suffix,
            }}
            templateOptions={templates ?? []}
          />

          <ProductMediaManager
            productId={product.id}
            initialMedia={(media ?? []).map((m) => ({ id: m.id, url: mediaUrl(m.storage_path), altText: m.alt_text, variantId: m.variant_id }))}
            variants={variantOptions}
          />

          <ProductVariantsTable productId={product.id} productStatus={product.status} initialVariants={variants ?? []} />

          <ProductComplementaryManager productId={product.id} initial={complementaryItems} />

          <VariantStockHistory variants={variantOptions} />

          <ProductSeoForm productId={product.id} initial={{ seoTitle: product.seo_title, seoDescription: product.seo_description }} />
        </div>

        <ProductSidebarActions
          productId={product.id}
          title={product.title}
          handle={product.handle}
          status={product.status}
          source={product.source}
          reviewCount={deleteImpact.reviewCount}
          orderItemCount={deleteImpact.orderItemCount}
          discountImpact={deleteImpact.discountImpact}
        />
      </div>
    </div>
  );
}
