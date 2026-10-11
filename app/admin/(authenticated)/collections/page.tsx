import Link from "next/link";
import Image from "next/image";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminCollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  let query = supabase.from("collections").select("id, title, handle, image_url, source, template_suffix", { count: "exact" });
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: collections, count } = await query.order("title").range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Kollektioner</h1>
        <Link href="/admin/collections/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          Ny kollektion
        </Link>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} kollektioner totalt</div>

      <form className="mb-4" action="/admin/collections" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder="Sök titel…" className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-sm" />
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-2 py-3"></th>
              <th className="px-5 py-3">Kollektion</th>
              <th className="px-5 py-3">Handle</th>
              <th className="px-5 py-3">Mall</th>
              <th className="px-5 py-3">Källa</th>
            </tr>
          </thead>
          <tbody>
            {(collections ?? []).map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-2 py-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded bg-gray-100">
                    {c.image_url && <Image src={c.image_url} alt="" fill className="object-cover" sizes="40px" />}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/collections/${c.id}`} className="font-medium text-gray-900 hover:underline">
                    {c.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{c.handle}</td>
                <td className="px-5 py-3 text-gray-500">{c.template_suffix || "—"}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.source === "shopify" ? "bg-gray-100 text-gray-700" : "text-gray-400"}`}>
                    {c.source === "shopify" ? "Shopify" : "Manuell"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(collections ?? []).length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga kollektioner hittades.</p>}
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/collections?${q ? `q=${q}&` : ""}page=${page - 1}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/collections?${q ? `q=${q}&` : ""}page=${page + 1}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
