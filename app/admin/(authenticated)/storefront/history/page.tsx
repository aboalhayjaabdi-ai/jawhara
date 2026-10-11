import Link from "next/link";
import { listVersions } from "@/lib/admin/storefront-layout";
import { RestoreVersionButton } from "@/components/admin/restore-version-button";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function StorefrontHistoryPage() {
  const versions = await listVersions("home");

  return (
    <div className="max-w-2xl">
      <Link href="/admin/storefront" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Webbutik
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Versionshistorik</h1>
      <p className="mb-6 text-xs text-gray-500">
        Varje publicering skapar en ny version. Att återställa en version kopierar den till utkastet -- den går inte live förrän du
        publicerar igen.
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Publicerad</th>
              <th className="px-4 py-3">Anteckning</th>
              <th className="px-4 py-3">Sektioner</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">v{v.version}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(v.publishedAt)}</td>
                <td className="px-4 py-3 text-gray-500">{v.note ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">{v.sectionCount}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <a href={`/preview?version=${v.version}`} target="_blank" rel="noreferrer" className="text-xs text-gray-700 underline hover:text-gray-900">
                      Förhandsgranska
                    </a>
                    <RestoreVersionButton version={v.version} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {versions.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga versioner publicerade ännu.</p>}
      </div>
    </div>
  );
}
