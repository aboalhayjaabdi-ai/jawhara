"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string; needsConfirmation?: boolean };

export async function updateProductCore(
  productId: string,
  input: { title: string; vendor: string | null; productType: string | null; descriptionHtml: string | null; tags: string[]; templateSuffix: string | null }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!input.title.trim()) return { ok: false, error: "Titel krävs." };

  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  const { error } = await supabaseService
    .from("products")
    .update({
      title: input.title.trim(),
      vendor: input.vendor || null,
      product_type: input.productType || null,
      description_html: input.descriptionHtml || null,
      tags: input.tags,
      template_suffix: input.templateSuffix || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.update_core", "product", productId, { title: input.title });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}

export async function updateProductSeo(productId: string, input: { seoTitle: string | null; seoDescription: string | null }): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  const { error } = await supabaseService
    .from("products")
    .update({ seo_title: input.seoTitle || null, seo_description: input.seoDescription || null })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.update_seo", "product", productId, {});
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}

/** Handle edits on a source='shopify' product need an explicit typed confirmation, since the
 * homepage (app/(storefront)/page.tsx) and lib/collection-tiles.ts reference some handles directly
 * with no referential-integrity check -- silently renaming one could break a hardcoded section. */
export async function updateProductHandle(productId: string, newHandle: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const handle = newHandle.trim().toLowerCase();
  if (!handle) return { ok: false, error: "Handle krävs." };

  const { data: product } = await supabaseService.from("products").select("handle, source").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };
  if (product.handle === handle) return { ok: true };

  if (product.source === "shopify" && !confirmed) {
    return { ok: false, error: "Den här produkten kan vara länkad från startsidan. Bekräfta för att byta handle ändå.", needsConfirmation: true };
  }

  const { data: existing } = await supabaseService.from("products").select("id").eq("handle", handle).maybeSingle();
  if (existing) return { ok: false, error: "En annan produkt använder redan den handlen." };

  const oldHandle = product.handle;
  const { error } = await supabaseService.from("products").update({ handle }).eq("id", productId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.update_handle", "product", productId, { oldHandle, newHandle: handle });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${oldHandle}`);
  revalidatePath(`/products/${handle}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setProductStatus(productId: string, status: "active" | "draft" | "archived"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    const { data: current } = await supabaseService.from("products").select("published_at").eq("id", productId).maybeSingle();
    if (!current?.published_at) patch.published_at = new Date().toISOString();
  }

  const { data: product, error } = await supabaseService.from("products").update(patch).eq("id", productId).select("handle").single();
  if (error || !product) return { ok: false, error: error?.message ?? "Produkten hittades inte." };

  await logAdminAction(admin.adminId, "products.set_status", "product", productId, { status });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}
