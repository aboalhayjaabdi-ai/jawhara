import { supabaseService } from "@/lib/supabase/service-client";
import { mediaUrl } from "@/lib/supabase/media";
import { normalizeVariantTitle } from "@/lib/variant-title";

if (typeof window !== "undefined") {
  throw new Error("lib/erp/products.ts must never be imported into client code");
}

/**
 * Active products with their variants, SKUs and public image URLs, read from the website's own
 * product data (Supabase) -- the same images the site shows. Each variant gets its own image when
 * the product has one assigned to that variant, otherwise the product's first image. Read-only:
 * nothing is uploaded anywhere.
 */
export async function listProducts(params: { offset: number; limit: number; sku: string | null; updatedSince: string | null }) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se").replace(/\/$/, "");

  let productIds: string[] | null = null;
  if (params.sku) {
    const { data } = await supabaseService.from("product_variants").select("product_id").ilike("sku", params.sku.replace(/[%_]/g, ""));
    productIds = [...new Set((data ?? []).map((v: any) => v.product_id))];
    if (productIds.length === 0) return { products: [], total: 0, nextOffset: null };
  }

  let q = supabaseService
    .from("products")
    .select("id, handle, title, product_type, updated_at, product_variants(id, sku, barcode, title, option1, option2, option3, price, compare_at_price, weight, weight_unit)", { count: "exact" })
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .range(params.offset, params.offset + params.limit - 1);
  if (productIds) q = q.in("id", productIds);
  if (params.updatedSince) q = q.gt("updated_at", params.updatedSince);
  const { data: products, count, error } = await q;
  if (error) throw new Error(`products query failed: ${error.message}`);

  const ids = (products ?? []).map((p: any) => p.id);
  const { data: media } = ids.length
    ? await supabaseService.from("media").select("product_id, variant_id, storage_path, position").in("product_id", ids).order("position")
    : { data: [] as any[] };
  const mediaByProduct = new Map<string, any[]>();
  for (const m of media ?? []) mediaByProduct.set(m.product_id, [...(mediaByProduct.get(m.product_id) ?? []), m]);

  const out = (products ?? []).map((p: any) => {
    const imgs = mediaByProduct.get(p.id) ?? [];
    const first = imgs[0] ? mediaUrl(imgs[0].storage_path) : null;
    return {
      productId: p.id,
      handle: p.handle,
      title: p.title,
      productType: p.product_type || null,
      url: `${siteUrl}/products/${p.handle}`,
      updatedAt: p.updated_at,
      images: imgs.map((m) => mediaUrl(m.storage_path)),
      variants: ((p.product_variants ?? []) as any[]).map((v) => {
        const own = imgs.find((m) => m.variant_id === v.id);
        return {
          variantId: v.id,
          sku: v.sku || null,
          barcode: v.barcode || null,
          title: normalizeVariantTitle(v.title),
          options: [v.option1, v.option2, v.option3].filter((o) => o && o !== "Default Title"),
          price: Number(v.price),
          compareAtPrice: v.compare_at_price != null ? Number(v.compare_at_price) : null,
          weight: v.weight != null ? Number(v.weight) : null,
          weightUnit: v.weight_unit,
          imageUrl: own ? mediaUrl(own.storage_path) : first,
          imageIsVariantSpecific: !!own,
        };
      }),
    };
  });
  const total = count ?? out.length;
  const next = params.offset + out.length;
  return { products: out, total, nextOffset: next < total ? next : null };
}
