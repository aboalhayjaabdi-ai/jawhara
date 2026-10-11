import Link from "next/link";
import { getLowStockVariants } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function InventoryLowStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const threshold = Math.max(0, Number(one(sp.threshold) ?? "5") || 5);
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, count } = await getLowStockVariants(threshold, PAGE_SIZE, offset);
  const hasNextPage = page * PAGE_SIZE < count;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
            ← Produkter
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Lågt lager</h1>
        </div>
        <Link href="/admin/products/inventory/history" className="text-xs font-medium text-gray-600 underline hover:text-gray-900">
          Lagerhistorik (hela butiken)
        </Link>
      </div>

      <form className="mb-4 flex items-center gap-2 text-sm">
        <label className="text-xs text-gray-500">Gräns</label>
        <input type="number" name="threshold" defaultValue={threshold} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
        <button type="submit" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Uppdatera
        </button>
      </form>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{count} varianter med {threshold} eller färre i lager</div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="p-3">Produkt</th>
              <th className="p-3">Alternativ</th>
              <th className="p-3">Lagerantal</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.variantId} className="border-b border-gray-100">
                <td className="p-3 font-medium text-gray-900">{v.title}</td>
                <td className="p-3 text-gray-500">{v.option ?? "—"}</td>
                <td className={`p-3 font-medium ${v.quantity <= 0 ? "text-rose-600" : "text-amber-600"}`}>{v.quantity}</td>
                <td className="p-3">
                  <a href={`/products/${v.productHandle}`} target="_blank" rel="noreferrer" className="text-xs text-gray-500 underline hover:text-gray-900">
                    Visa i butiken
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-gray-400">
                  Inga varianter under gränsen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/products/inventory?threshold=${threshold}&page=${page - 1}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/products/inventory?threshold=${threshold}&page=${page + 1}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
