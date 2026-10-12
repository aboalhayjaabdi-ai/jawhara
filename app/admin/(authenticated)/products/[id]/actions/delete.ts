"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { getProductDeleteImpact, type ProductDeleteImpact } from "@/lib/admin/product-delete-impact";

export type DeleteResult = { ok: true } | { ok: false; error: string };

export { getProductDeleteImpact, type ProductDeleteImpact };

export async function deleteProduct(productId: string, confirmed: boolean): Promise<DeleteResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { data: product } = await supabaseService.from("products").select("handle, title").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  const impact = await getProductDeleteImpact(productId);
  const { error } = await supabaseService.from("products").delete().eq("id", productId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.delete", "product", productId, { title: product.title, impact });
  revalidatePath("/admin/products");
  revalidatePath(`/products/${product.handle}`);
  return { ok: true };
}
