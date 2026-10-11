"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type CreateProductResult = { ok: true; productId: string } | { ok: false; error: string };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Always creates a product with exactly one default variant -- a product must never exist with
 * zero variants (lib/queries.ts's toCard() and the storefront PDP both expect at least one). */
export async function createProduct(input: { title: string; handle?: string; status: "active" | "draft" | "archived" }): Promise<CreateProductResult> {
  const admin = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titel krävs." };

  const baseHandle = (input.handle?.trim() || slugify(title)) || `produkt-${Date.now()}`;
  let handle = baseHandle;
  let attempt = 0;
  // Handle must be unique -- retry with a numeric suffix on conflict rather than failing outright.
  for (;;) {
    const { data: existing } = await supabaseService.from("products").select("id").eq("handle", handle).maybeSingle();
    if (!existing) break;
    attempt += 1;
    handle = `${baseHandle}-${attempt + 1}`;
  }

  const { data: product, error: productError } = await supabaseService
    .from("products")
    .insert({ title, handle, status: input.status, source: "manual" })
    .select("id")
    .single();
  if (productError || !product) return { ok: false, error: productError?.message ?? "Kunde inte skapa produkten." };

  const { error: variantError } = await supabaseService.from("product_variants").insert({
    product_id: product.id,
    title: "Default Title",
    price: 0,
    inventory_quantity: 0,
    inventory_tracked: true,
  });
  if (variantError) {
    await supabaseService.from("products").delete().eq("id", product.id);
    return { ok: false, error: variantError.message };
  }

  await logAdminAction(admin.adminId, "products.create", "product", product.id, { title, handle });
  return { ok: true, productId: product.id };
}
