import Link from "next/link";
import { listEmailTemplates } from "@/lib/admin/email-templates";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null) {
  if (!iso) return "Aldrig publicerad";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminEmailTemplatesPage() {
  const templates = await listEmailTemplates();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">E-postmallar</h1>
      <p className="mb-6 text-xs text-gray-500">
        De riktiga transaktionsmejl som skickas till kunder (orderbekräftelse, leveransbekräftelse, återbetalning). Ändringar
        påverkar aldrig ett riktigt kundmejl förrän du klickar "Publicera".
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Mall</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Senast publicerad</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/email-templates/${t.id}`} className="font-medium text-gray-900 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  {t.hasUnpublishedChanges ? (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Opublicerade ändringar
                    </span>
                  ) : (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Publicerad</span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-400">{formatDate(t.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
