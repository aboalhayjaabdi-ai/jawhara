"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const LIMIT_OPTIONS = [
  { value: "10", label: "10" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "500", label: "500" },
  { value: "all", label: "Alla" },
];

export function OrdersExportPanel({ matchingCount }: { matchingCount: number }) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState("100");

  const exportParams = new URLSearchParams(searchParams.toString());
  exportParams.delete("page");
  exportParams.set("limit", limit);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Exportera till Excel
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 text-xs text-gray-500">{matchingCount} ordrar matchar nuvarande filter.</div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Antal att exportera</label>
          <select value={limit} onChange={(e) => setLimit(e.target.value)} className="mb-3 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm">
            {LIMIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <a
            href={`/api/admin/orders/export?${exportParams.toString()}`}
            onClick={() => setOpen(false)}
            className="block rounded-md bg-gray-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-gray-800"
          >
            Ladda ner .xlsx
          </a>
        </div>
      )}
    </div>
  );
}
