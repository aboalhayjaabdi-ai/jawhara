"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkSetDiscountStatus, bulkDeleteDiscounts } from "@/app/admin/(authenticated)/discounts/actions/bulk";

export type DiscountRow = {
  id: string;
  title: string;
  kind: "automatic" | "code";
  code: string | null;
  status: "draft" | "scheduled" | "active" | "expired";
  shape: "order_percentage" | "bxgy" | "other";
  getPercentage: number | null;
  startsAt: string | null;
  endsAt: string | null;
  redemptionCount: number;
  usageLimit: number | null;
};

const STATUS_LABEL: Record<string, string> = { draft: "Utkast", scheduled: "Schemalagd", active: "Aktiv", expired: "Utgången" };
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-400",
};
const SHAPE_LABEL: Record<string, string> = { order_percentage: "Procent på order", bxgy: "Köp X få Y", other: "Övrigt" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

type BulkAction = "activate" | "draft" | "delete";

export function DiscountsTable({ discounts }: { discounts: DiscountRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | "">("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run() {
    setMessage(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      let result: { ok: boolean; count?: number; error?: string };
      switch (action) {
        case "activate":
          result = await bulkSetDiscountStatus(ids, "active");
          break;
        case "draft":
          result = await bulkSetDiscountStatus(ids, "draft");
          break;
        case "delete":
          result = await bulkDeleteDiscounts(ids, confirmDelete);
          break;
        default:
          return;
      }
      if (result.ok) {
        setMessage(`Klart: ${result.count} rabatt(er) uppdaterade.`);
        setSelected(new Set());
        setAction("");
        setConfirmDelete(false);
      } else {
        setMessage(result.error ?? "Åtgärden misslyckades.");
      }
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-700">{selected.size} valda</span>
            <select value={action} onChange={(e) => setAction(e.target.value as BulkAction)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
              <option value="">Välj åtgärd…</option>
              <option value="activate">Aktivera</option>
              <option value="draft">Sätt som utkast</option>
              <option value="delete">Radera</option>
            </select>
            {action === "delete" && (
              <label className="flex items-center gap-1 text-xs text-rose-700">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                Bekräfta permanent radering
              </label>
            )}
            {action && (
              <button type="button" onClick={run} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {isPending ? "Bearbetar…" : "Verkställ"}
              </button>
            )}
          </div>
          {message && <div className="mt-2 text-xs text-gray-600">{message}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={discounts.length > 0 && selected.size === discounts.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(discounts.map((d) => d.id)) : new Set())}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-5 py-3">Rabatt</th>
              <th className="px-5 py-3">Typ</th>
              <th className="px-5 py-3">Form</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Period</th>
              <th className="px-5 py-3">Användning</th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/discounts/${d.id}`} prefetch={false} className="font-medium text-gray-900 hover:underline">
                    {d.title}
                  </Link>
                  {d.code && <div className="text-xs font-mono text-gray-400">{d.code}</div>}
                </td>
                <td className="px-5 py-3 text-gray-500">{d.kind === "automatic" ? "Automatisk" : "Kod"}</td>
                <td className="px-5 py-3 text-gray-500">
                  {SHAPE_LABEL[d.shape]}
                  {d.getPercentage != null && <span className="ml-1 text-gray-400">({d.getPercentage}%)</span>}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {formatDate(d.startsAt)} – {formatDate(d.endsAt)}
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {d.redemptionCount}
                  {d.usageLimit != null && ` / ${d.usageLimit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {discounts.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga rabatter hittades.</p>}
      </div>
    </div>
  );
}
