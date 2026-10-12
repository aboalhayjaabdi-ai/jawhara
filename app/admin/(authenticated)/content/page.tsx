import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { html: "Text", faq: "Vanliga frågor", contact: "Kontaktformulär" };

export default async function AdminContentPage() {
  const supabase = await createAuthServerClient();
  const { data: pages } = await supabase.from("content_pages").select("id, handle, title, type, updated_at").order("title");

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Innehåll</h1>
      <p className="mb-6 text-xs text-gray-500">Redigera texten på de riktiga info- och policysidorna (/pages/handle).</p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Sida</th>
              <th className="px-5 py-3">Typ</th>
              <th className="px-5 py-3">URL</th>
              <th className="px-5 py-3">Senast ändrad</th>
            </tr>
          </thead>
          <tbody>
            {(pages ?? []).map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/content/${p.id}`} className="font-medium text-gray-900 hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{TYPE_LABEL[p.type] ?? p.type}</td>
                <td className="px-5 py-3 font-mono text-xs text-gray-400">/pages/{p.handle}</td>
                <td className="px-5 py-3 text-gray-400">{new Date(p.updated_at).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(pages ?? []).length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga sidor hittades.</p>}
      </div>
    </div>
  );
}
