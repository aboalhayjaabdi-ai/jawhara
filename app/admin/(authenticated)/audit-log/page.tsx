import Link from "next/link";
import { listAuditLog, parseAuditLogFilters, AUDIT_LOG_PAGE_SIZE } from "@/lib/admin/audit-log";
import { AuditLogFilterBar } from "@/components/admin/audit-log-filter-bar";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail || Object.keys(detail).length === 0) return "—";
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
}

export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseAuditLogFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);

  const { rows, total } = await listAuditLog(filters, page);
  const hasNextPage = page * AUDIT_LOG_PAGE_SIZE < total;
  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Aktivitetslogg</h1>
        <Link href="/admin/settings" className="text-xs text-gray-500 underline hover:text-gray-900">
          ← Inställningar
        </Link>
      </div>
      <p className="mb-6 text-xs text-gray-500">Varje administratörsåtgärd i Jawhara Admin, oavsett modul -- källan är audit_log, skriven av varje muterande åtgärd.</p>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} händelser totalt</div>
      <AuditLogFilterBar />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Administratör</th>
              <th className="px-4 py-3">Åtgärd</th>
              <th className="px-4 py-3">Objekt</th>
              <th className="px-4 py-3">Detaljer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3 text-gray-700">{r.actorEmail ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-900">{r.action}</td>
                <td className="px-4 py-3 text-gray-500">{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</td>
                <td className="max-w-md truncate px-4 py-3 text-xs text-gray-400" title={formatDetail(r.detail)}>
                  {formatDetail(r.detail)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga händelser hittades.</p>}
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/audit-log?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/audit-log?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
