import Link from "next/link";
import { getDraftSections, getLayoutMeta } from "@/lib/admin/storefront-layout";
import { StorefrontEditor } from "@/components/admin/storefront-editor";

export const dynamic = "force-dynamic";

export default async function AdminStorefrontPage() {
  const [sections, meta] = await Promise.all([getDraftSections("home"), getLayoutMeta("home")]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Webbutik — startsida</h1>
          <p className="text-xs text-gray-500">
            Redigera, förhandsgranska och publicera startsidans sektioner.{" "}
            <Link href="/admin/storefront/history" className="underline hover:text-gray-900">
              Versionshistorik
            </Link>{" "}
            ·{" "}
            <Link href="/admin/storefront/menus" className="underline hover:text-gray-900">
              Menyer
            </Link>{" "}
            ·{" "}
            <Link href="/admin/product-templates" className="underline hover:text-gray-900">
              Produktmallar
            </Link>{" "}
            ·{" "}
            <Link href="/admin/collections" className="underline hover:text-gray-900">
              Kollektioner (bilder/underkategorier hanteras där)
            </Link>
          </p>
        </div>
      </div>
      <StorefrontEditor initialSections={sections} meta={meta} />
    </div>
  );
}
