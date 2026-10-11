"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type VariantPatch = {
  id?: string; // present = update, absent = insert
  title: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  compare_at_price: number | null;
  inventory_quantity: number;
  inventory_tracked: boolean;
  inventory_policy: "DENY" | "CONTINUE" | null;
  weight: number | null;
  weight_unit: "g" | "kg";
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export async function saveVariants(productId: string, patches: VariantPatch[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (patches.length === 0) return { ok: false, error: "Minst en variant krävs." };

  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  for (const p of patches) {
    if (p.price < 0) return { ok: false, error: `Priset kan inte vara negativt (${p.title}).` };
    const row = {
      product_id: productId,
      title: p.title || "Default Title",
      sku: p.sku || null,
      barcode: p.barcode || null,
      price: p.price,
      compare_at_price: p.compare_at_price,
      inventory_quantity: p.inventory_tracked ? p.inventory_quantity : p.inventory_quantity, // retained even while untracked, never zeroed
      inventory_tracked: p.inventory_tracked,
      inventory_policy: p.inventory_tracked ? p.inventory_policy : null,
      weight: p.weight,
      weight_unit: p.weight_unit,
      option1: p.option1 || null,
      option2: p.option2 || null,
      option3: p.option3 || null,
    };
    if (p.id) {
      const { error } = await supabaseService.from("product_variants").update(row).eq("id", p.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabaseService.from("product_variants").insert(row);
      if (error) return { ok: false, error: error.message };
    }
  }

  await logAdminAction(admin.adminId, "products.save_variants", "product", productId, { count: patches.length });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}

export async function deleteVariant(productId: string, variantId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { count } = await supabaseService.from("product_variants").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((count ?? 0) <= 1) return { ok: false, error: "En produkt måste ha minst en variant." };

  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  const { error } = await supabaseService.from("product_variants").delete().eq("id", variantId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.delete_variant", "product", productId, { variantId });
  revalidatePath(`/admin/products/${productId}`);
  if (product) revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}
