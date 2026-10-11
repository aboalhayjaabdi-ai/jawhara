"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type DuplicateResult = { ok: true; newProductId: string } | { ok: false; error: string };

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** New draft product, always shopify_id=null/source='manual'. Images copied by default (cheap --
 * same storage_path, no re-upload); quantities zeroed by default -- matches real Shopify Admin's
 * own duplicate-modal defaults. */
export async function duplicateProduct(productId: string, options: { copyImages: boolean; copyQuantities: boolean }): Promise<DuplicateResult> {
  const admin = await requireAdmin();

  const { data: original } = await supabaseService.from("products").select("*").eq("id", productId).maybeSingle();
  if (!original) return { ok: false, error: "Produkten hittades inte." };

  const baseHandle = `${original.handle}-kopia`;
  let handle = `${baseHandle}-${randomSuffix()}`;
  // Vanishingly unlikely to collide given the random suffix, but check anyway rather than assume.
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabaseService.from("products").select("id").eq("handle", handle).maybeSingle();
    if (!existing) break;
    handle = `${baseHandle}-${randomSuffix()}`;
  }

  const { data: newProduct, error: productError } = await supabaseService
    .from("products")
    .insert({
      shopify_id: null,
      source: "manual",
      title: `${original.title} (kopia)`,
      handle,
      status: "draft",
      product_type: original.product_type,
      vendor: original.vendor,
      description_html: original.description_html,
      tags: original.tags,
      seo_title: original.seo_title,
      seo_description: original.seo_description,
      template_suffix: original.template_suffix,
      published_at: null,
    })
    .select("id")
    .single();
  if (productError || !newProduct) return { ok: false, error: productError?.message ?? "Kunde inte duplicera produkten." };

  const { data: variants } = await supabaseService.from("product_variants").select("*").eq("product_id", productId);
  const variantIdMap = new Map<string, string>();
  for (const v of variants ?? []) {
    const { data: newVariant } = await supabaseService
      .from("product_variants")
      .insert({
        product_id: newProduct.id,
        shopify_id: null,
        title: v.title,
        sku: v.sku ? `${v.sku}-COPY` : null,
        barcode: v.barcode,
        price: v.price,
        compare_at_price: v.compare_at_price,
        inventory_quantity: options.copyQuantities ? v.inventory_quantity : 0,
        inventory_policy: v.inventory_policy,
        taxable: v.taxable,
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        inventory_tracked: v.inventory_tracked,
        weight: v.weight,
        weight_unit: v.weight_unit,
      })
      .select("id")
      .single();
    if (newVariant) variantIdMap.set(v.id, newVariant.id);
  }

  if (options.copyImages) {
    const { data: media } = await supabaseService.from("media").select("*").eq("product_id", productId).order("position");
    for (const m of media ?? []) {
      await supabaseService.from("media").insert({
        shopify_id: null,
        product_id: newProduct.id,
        variant_id: m.variant_id ? variantIdMap.get(m.variant_id) ?? null : null,
        storage_path: m.storage_path,
        alt_text: m.alt_text,
        width: m.width,
        height: m.height,
        position: m.position,
      });
    }
  }

  await logAdminAction(admin.adminId, "products.duplicate", "product", newProduct.id, { fromProductId: productId, ...options });
  return { ok: true, newProductId: newProduct.id };
}
