"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export type ProductTemplateInput = {
  key: string;
  name: string;
  introParagraph: string | null;
  trustLines: string[] | null;
  uspBlock: { heading: string; body: string }[] | null;
  faq: { question: string; answer: string }[] | null;
  descriptionHeading: string;
  accordionRows: { heading: string; body: string }[];
  sizeGuideHref: string | null;
  offerMessage: { heading: string; body: string; href?: string | null } | null;
  showInventoryStatus: boolean;
  galleryLayout: "carousel" | "grid";
};

function toRow(input: ProductTemplateInput) {
  return {
    key: input.key,
    name: input.name,
    intro_paragraph: input.introParagraph,
    trust_lines: input.trustLines,
    usp_block: input.uspBlock,
    faq: input.faq,
    description_heading: input.descriptionHeading,
    accordion_rows: input.accordionRows,
    size_guide_href: input.sizeGuideHref,
    offer_message: input.offerMessage,
    show_inventory_status: input.showInventoryStatus,
    gallery_layout: input.galleryLayout,
  };
}

export async function createProductTemplate(input: ProductTemplateInput): Promise<CreateResult> {
  const admin = await requireAdmin();
  if (!input.key.trim() || !input.name.trim()) return { ok: false, error: "Nyckel och namn krävs." };

  const { data, error } = await supabaseService.from("product_templates").insert(toRow(input)).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Kunde inte skapa mallen." };

  await logAdminAction(admin.adminId, "product_templates.create", "product_template", data.id, { key: input.key });
  revalidatePath("/admin/product-templates");
  return { ok: true, id: data.id };
}

export async function updateProductTemplate(id: string, input: ProductTemplateInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("product_templates").update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "product_templates.update", "product_template", id, { key: input.key });
  revalidatePath("/admin/product-templates");
  revalidatePath("/"); // template content is read by every PDP using this key
  return { ok: true };
}
