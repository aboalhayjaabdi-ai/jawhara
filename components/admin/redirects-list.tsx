"use client";

import { useState, useTransition } from "react";
import { createRedirect, deleteRedirect } from "@/app/admin/(authenticated)/settings/redirects/actions";

export type RedirectRow = { id: string; sourcePath: string; destinationPath: string; createdAt: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

export function RedirectsList({ initial }: { initial: RedirectRow[] }) {
  const [rows, setRows] = useState(initial);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    if (!source.trim() || !destination.trim()) {
      setError("Båda fälten krävs.");
      return;
    }
    startTransition(async () => {
      const result = await createRedirect(source, destination);
      if (result.ok) {
        setRows((prev) => [result.redirect, ...prev]);
        setSource("");
        setDestination("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(() => {
      deleteRedirect(id);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Ny omdirigering</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Från (gammal länk)</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="/gammal-sida" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Till (ny länk)</label>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="/ny-sida" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
        <button type="button" onClick={handleCreate} disabled={isPending} className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Lägg till omdirigering"}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Från</th>
              <th className="px-4 py-3">Till</th>
              <th className="px-4 py-3">Skapad</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-gray-900">{r.sourcePath}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.destinationPath}</td>
                <td className="px-4 py-3 text-gray-400">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => handleDelete(r.id)} className="text-xs text-rose-600 hover:text-rose-700">
                    Ta bort
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga omdirigeringar ännu.</p>}
      </div>
    </div>
  );
}
