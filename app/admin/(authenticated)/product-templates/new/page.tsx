import Link from "next/link";
import { ProductTemplateForm } from "@/components/admin/product-template-form";

export default function NewProductTemplatePage() {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/product-templates" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Produktmallar
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny produktmall</h1>
      <ProductTemplateForm
        initial={{
          key: "",
          name: "",
          introParagraph: null,
          trustLines: null,
          uspBlock: null,
          faq: null,
          descriptionHeading: "Specifikationer",
          accordionRows: [],
          sizeGuideHref: null,
          offerMessage: null,
          showInventoryStatus: true,
          galleryLayout: "grid",
        }}
      />
    </div>
  );
}
