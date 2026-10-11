"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkAddTags, bulkRemoveTags, bulkSetMarketingConsent, bulkDelete } from "@/app/admin/(authenticated)/customers/actions/bulk";

export type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  acceptsMarketing: boolean;
  source: "shopify" | "manual";
  anonymized: boolean;
  orderCount: number;
  totalSpent: number;
  country: string | null;
};

type BulkAction = "tags-add" | "tags-remove" | "marketing-yes" | "marketing-no" | "delete";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | "">("");
  const [tagsInput, setTagsInput] = useState("");
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
      let result: { ok: boolean; count?: number; error?: string; skipped?: string[] };
      switch (action) {
        case "tags-add":
          result = await bulkAddTags(ids, tagsInput.split(",").map((t) => t.trim()).filter(Boolean));
          break;
        case "tags-remove":
          result = await bulkRemoveTags(ids, tagsInput.split(",").map((t) => t.trim()).filter(Boolean));
          break;
        case "marketing-yes":
          result = await bulkSetMarketingConsent(ids, true);
          break;
        case "marketing-no":
          result = await bulkSetMarketingConsent(ids, false);
          break;
        case "delete":
          result = await bulkDelete(ids, confirmDelete);
          break;
        default:
          return;
      }
      if (result.ok) {
        setMessage(`Klart: ${result.count} kund(er) uppdaterade${result.skipped?.length ? `, ${result.skipped.length} hoppades över (har orderhistorik -- använd Anonymisera istället)` : ""}.`);
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
              <option value="tags-add">Lägg till taggar</option>
              <option value="tags-remove">Ta bort taggar</option>
              <option value="marketing-yes">Markera: godkänner marknadsföring</option>
              <option value="marketing-no">Markera: godkänner inte marknadsföring</option>
              <option value="delete">Radera (endast utan orderhistorik)</option>
            </select>

            {(action === "tags-add" || action === "tags-remove") && (
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="komma, separerade, taggar" className="rounded-md border border-gray-200 px-2 py-1 text-xs" />
            )}
            {action === "delete" && (
              <label className="flex items-center gap-1 text-xs text-rose-700">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                Bekräfta permanent radering
              </label>
            )}

            {action && (
              <button
                type="button"
                onClick={run}
                disabled={isPending}
                className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
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
                  checked={customers.length > 0 && selected.size === customers.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(customers.map((c) => c.id)) : new Set())}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-5 py-3">Kund</th>
              <th className="px-5 py-3">Ort</th>
              <th className="px-5 py-3">Ordrar</th>
              <th className="px-5 py-3">Totalt köpt</th>
              <th className="px-5 py-3">Marknadsföring</th>
              <th className="px-5 py-3">Källa</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-gray-900 hover:underline">
                    {c.name || c.email || "Namnlös kund"}
                  </Link>
                  <div className="text-xs text-gray-400">{c.email ?? "—"}</div>
                  {c.tags.length > 0 && <div className="mt-1 text-[10px] text-gray-400">{c.tags.join(", ")}</div>}
                </td>
                <td className="px-5 py-3 text-gray-500">{c.country ?? "—"}</td>
                <td className="px-5 py-3 text-gray-500">{c.orderCount}</td>
                <td className="px-5 py-3 text-gray-900">{formatSek(c.totalSpent)}</td>
                <td className="px-5 py-3">
                  <span className={c.acceptsMarketing ? "text-emerald-600" : "text-gray-400"}>{c.acceptsMarketing ? "Godkänner" : "Nej"}</span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      c.source === "shopify" ? "bg-gray-100 text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {c.source === "shopify" ? "Shopify" : "Manuell"}
                  </span>
                  {c.anonymized && <span className="ml-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Anonymiserad</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga kunder hittades.</p>}
      </div>
    </div>
  );
}
