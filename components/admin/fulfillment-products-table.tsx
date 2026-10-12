import Image from "next/image";
import Link from "next/link";
import type { AdminLocale } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";

export type FulfillmentProductRow = {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
};

const STATUS_KEY: Record<string, "products.status.active" | "products.status.draft" | "products.status.archived"> = {
  active: "products.status.active",
  draft: "products.status.draft",
  archived: "products.status.archived",
};

function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null) return "—";
  if (max == null || max === min) return `${Math.round(min)} kr`;
  return `${Math.round(min)}–${Math.round(max)} kr`;
}

/**
 * Read-only product list for the restricted "fulfillment_staff" role (see
 * lib/admin/permissions.ts) -- a plain Server Component, since there is nothing here for a
 * client component to do (no edit controls, no bulk actions). Links into the same
 * /admin/products/[id] route the full admin uses; that page itself branches to a read-only view
 * for this role (components/admin/fulfillment-product-detail.tsx).
 */
export function FulfillmentProductsTable({ products, locale }: { products: FulfillmentProductRow[]; locale: AdminLocale }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">{t(locale, "products.col.image")}</th>
            <th className="px-4 py-3">{t(locale, "products.col.title")}</th>
            <th className="px-4 py-3">{t(locale, "products.col.status")}</th>
            <th className="px-4 py-3">{t(locale, "products.col.price")}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link href={`/admin/products/${p.id}`} className="relative block h-12 w-12 overflow-hidden rounded-md bg-gray-100">
                  {p.thumbnailUrl ? (
                    <Image src={p.thumbnailUrl} alt={p.title} fill sizes="48px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">{t(locale, "order.noImage")}</div>
                  )}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link href={`/admin/products/${p.id}`} className="font-medium text-gray-900 hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-500">{STATUS_KEY[p.status] ? t(locale, STATUS_KEY[p.status]) : p.status}</td>
              <td className="px-4 py-3 text-gray-500">{formatPriceRange(p.minPrice, p.maxPrice)}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-sm text-gray-400" colSpan={4}>
                {t(locale, "products.empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
