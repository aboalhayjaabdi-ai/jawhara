"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type PreviewGroup = {
  handle: string;
  title: string | null;
  action: "create" | "update";
  productId: string | null;
  variantsToCreate: number;
  variantsToUpdate: number;
  warnings: string[];
  errors: string[];
};

type CommitResult = { handle: string; ok: boolean; action: "create" | "update"; productId?: string; error?: string };

export function CsvImportWizard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewGroup[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      const res = await fetch("/api/admin/products/import/preview", {
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
      setSelected(new Set(data.preview.filter((g: PreviewGroup) => g.errors.length === 0).map((g: PreviewGroup) => g.handle)));
    } finally {
      setLoading(null);
    }
  }

  async function runCommit() {
    if (!csvText || selected.size === 0) return;
    setLoading("commit");
    setError(null);
    try {
      const res = await fetch("/api/admin/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, handles: Array.from(selected) }),
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

  function toggle(handle: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="mb-4 text-sm text-gray-600">
          Ladda upp en CSV-fil i samma format som exporten (<Link href="/admin/products" className="underline">Produkter → Exportera CSV</Link>).
          Produkter matchas på <strong>Handle</strong> -- en befintlig handle uppdateras, en ny skapas. Tomma celler lämnar befintliga
          värden oförändrade; import tar aldrig bort en produkt eller variant som saknas i filen.
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
            <div className="text-sm font-medium text-gray-900">{preview.length} produkter i filen -- {selected.size} markerade för import</div>
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
                <th className="p-3">Handle</th>
                <th className="p-3">Titel</th>
                <th className="p-3">Åtgärd</th>
                <th className="p-3">Varianter</th>
                <th className="p-3">Varningar / fel</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((g) => (
                <tr key={g.handle} className={`border-b border-gray-100 ${g.errors.length > 0 ? "bg-rose-50" : ""}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(g.handle)}
                      disabled={g.errors.length > 0}
                      onChange={() => toggle(g.handle)}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-600">{g.handle}</td>
                  <td className="p-3">{g.title ?? "—"}</td>
                  <td className="p-3">{g.action === "create" ? "Skapa ny" : "Uppdatera"}</td>
                  <td className="p-3 text-xs text-gray-600">
                    {g.variantsToCreate > 0 && <div>{g.variantsToCreate} nya</div>}
                    {g.variantsToUpdate > 0 && <div>{g.variantsToUpdate} uppdaterade</div>}
                  </td>
                  <td className="p-3 text-xs">
                    {g.errors.map((e, i) => (
                      <div key={i} className="text-rose-600">{e}</div>
                    ))}
                    {g.warnings.map((w, i) => (
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
                <th className="p-3">Handle</th>
                <th className="p-3">Resultat</th>
                <th className="p-3">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.handle} className="border-b border-gray-100">
                  <td className="p-3 font-mono text-xs text-gray-600">
                    {r.productId ? (
                      <Link href={`/admin/products/${r.productId}`} className="underline">
                        {r.handle}
                      </Link>
                    ) : (
                      r.handle
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
