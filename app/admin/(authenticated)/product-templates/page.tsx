import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminProductTemplatesPage() {
  const supabase = await createAuthServerClient();
  const { data: templates } = await supabase.from("product_templates").select("id, key, name").order("name");

  const { data: products } = await supabase.from("products").select("template_suffix").not("template_suffix", "is", null);
  const { data: collections } = await supabase.from("collections").select("template_suffix").not("template_suffix", "is", null);
  const usageCount = new Map<string, number>();
  for (const p of products ?? []) usageCount.set(p.template_suffix, (usageCount.get(p.template_suffix) ?? 0) + 1);
  for (const c of collections ?? []) usageCount.set(c.template_suffix, (usageCount.get(c.template_suffix) ?? 0) + 1);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Produktmallar</h1>
        <Link href="/admin/product-templates/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          Ny mall
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Namn</th>
              <th className="px-5 py-3">Nyckel</th>
              <th className="px-5 py-3">Används av</th>
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/product-templates/${t.id}`} className="font-medium text-gray-900 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{t.key}</td>
                <td className="px-5 py-3 text-gray-500">{usageCount.get(t.key) ?? 0} produkter/kollektioner</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(templates ?? []).length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga mallar ännu.</p>}
      </div>
    </div>
  );
}
