import Link from "next/link";
import { listMenusWithItems } from "@/lib/admin/storefront-menus";
import { MenuItemList } from "@/components/admin/menu-item-list";

export const dynamic = "force-dynamic";

export default async function StorefrontMenusPage() {
  const menus = await listMenusWithItems();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/storefront" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Webbutik
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Menyer</h1>
      <p className="mb-6 text-xs text-gray-500">
        Huvudmenyn (desktop/mobil-navigering) och de fyra fotlänkskolumnerna. Ändringar sparas och blir synliga direkt -- de har
        inget separat utkast/publicera-steg som startsidans sektioner.
      </p>

      <div className="space-y-4">
        {menus.map((menu) => (
          <MenuItemList key={menu.id} menu={menu} />
        ))}
      </div>
    </div>
  );
}
