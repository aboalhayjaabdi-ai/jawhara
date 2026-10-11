import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { ProductTemplateForm } from "@/components/admin/product-template-form";

export const dynamic = "force-dynamic";

export default async function EditProductTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();
  const { data: t } = await supabase.from("product_templates").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/product-templates" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Produktmallar
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">{t.name}</h1>
      <ProductTemplateForm
        id={t.id}
        initial={{
          key: t.key,
          name: t.name,
          introParagraph: t.intro_paragraph,
          trustLines: t.trust_lines,
          uspBlock: t.usp_block,
          faq: t.faq,
          descriptionHeading: t.description_heading,
          accordionRows: t.accordion_rows ?? [],
          sizeGuideHref: t.size_guide_href,
          offerMessage: t.offer_message,
          showInventoryStatus: t.show_inventory_status,
          galleryLayout: t.gallery_layout,
        }}
      />
    </div>
  );
}
