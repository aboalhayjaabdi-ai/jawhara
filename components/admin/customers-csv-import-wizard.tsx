"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type PreviewRow = {
  rowNumber: number;
  email: string | null;
  name: string | null;
  action: "create" | "update";
  customerId: string | null;
  errors: string[];
  warnings: string[];
};

type CommitResult = { rowNumber: number; email: string | null; ok: boolean; action: "create" | "update"; customerId?: string; error?: string };

export function CustomersCsvImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<CommitResult[] | null>(null);
  const [loading, setLoading] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFileChosen(file: File) {
    setError(null);
    setPreview(null);
    setResults(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function runPreview() {
    if (!csvText) return;
    setLoading("preview");
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/customers/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Förhandsgranskningen misslyckades.");
        return;
      }
      setPreview(data.preview);
      setParseErrors(data.parseErrors ?? []);
      setSelected(new Set(data.preview.filter((r: PreviewRow) => r.errors.length === 0).map((r: PreviewRow) => r.rowNumber)));
    } finally {
      setLoading(null);
    }
  }

  async function runCommit() {
    if (!csvText || selected.size === 0) return;
    setLoading("commit");
    setError(null);
    try {
      const res = await fetch("/api/admin/customers/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, rowNumbers: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Importen misslyckades.");
        return;
      }
      setResults(data.results);
      setPreview(null);
    } finally {
      setLoading(null);
    }
  }

  function toggle(rowNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="mb-4 text-sm text-gray-600">
          Ladda upp en CSV-fil i samma format som exporten (<Link href="/admin/customers" className="underline">Kunder → Exportera CSV</Link>).
          Kunder matchas på <strong>e-post</strong> (skiftlägesokänsligt) -- en befintlig e-post uppdateras, annars skapas en ny kund. En rad utan
          e-post kan inte matchas och skapas alltid som ny. Tomma celler lämnar befintliga värden oförändrade.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChosen(file);
          }}
          className="block text-sm"
        />
        {fileName && <div className="mt-2 text-xs text-gray-500">Vald fil: {fileName}</div>}
        <button
          type="button"
          onClick={runPreview}
          disabled={!csvText || loading !== null}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading === "preview" ? "Förhandsgranskar…" : "Förhandsgranska"}
        </button>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {parseErrors.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-medium">Rader som hoppades över:</div>
          <ul className="mt-1 list-inside list-disc">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">{preview.length} kunder i filen -- {selected.size} markerade för import</div>
            <button
              type="button"
              onClick={runCommit}
              disabled={selected.size === 0 || loading !== null}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading === "commit" ? "Importerar…" : `Importera ${selected.size} markerade`}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="p-3"></th>
                <th className="p-3">E-post</th>
                <th className="p-3">Namn</th>
                <th className="p-3">Åtgärd</th>
                <th className="p-3">Varningar / fel</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.rowNumber} className={`border-b border-gray-100 ${r.errors.length > 0 ? "bg-rose-50" : ""}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(r.rowNumber)} disabled={r.errors.length > 0} onChange={() => toggle(r.rowNumber)} />
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-600">{r.email ?? "—"}</td>
                  <td className="p-3">{r.name ?? "—"}</td>
                  <td className="p-3">{r.action === "create" ? "Skapa ny" : "Uppdatera"}</td>
                  <td className="p-3 text-xs">
                    {r.errors.map((e, i) => (
                      <div key={i} className="text-rose-600">{e}</div>
                    ))}
                    {r.warnings.map((w, i) => (
                      <div key={i} className="text-amber-700">{w}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4 text-sm font-medium text-gray-900">
            Import klar -- {results.filter((r) => r.ok).length} av {results.length} lyckades
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="p-3">E-post</th>
                <th className="p-3">Resultat</th>
                <th className="p-3">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.rowNumber} className="border-b border-gray-100">
                  <td className="p-3 font-mono text-xs text-gray-600">
                    {r.customerId ? (
                      <Link href={`/admin/customers/${r.customerId}`} className="underline">
                        {r.email ?? "(ingen e-post)"}
                      </Link>
                    ) : (
                      r.email ?? "(ingen e-post)"
                    )}
                  </td>
                  <td className={`p-3 text-xs ${r.ok ? "text-emerald-700" : "text-rose-600"}`}>{r.ok ? "OK" : r.error}</td>
                  <td className="p-3 text-xs text-gray-600">{r.action === "create" ? "Skapad" : "Uppdaterad"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
