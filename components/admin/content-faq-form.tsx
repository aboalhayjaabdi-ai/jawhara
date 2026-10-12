"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFaqPage } from "@/app/admin/(authenticated)/content/actions";

type FaqItem = { q: string; a: string };

export function FaqPageForm({ id, handle, initialTitle, initialItems }: { id: string; handle: string; initialTitle: string; initialItems: FaqItem[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [items, setItems] = useState<FaqItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateItem(index: number, field: "q" | "a", value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { q: "", a: "" }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateFaqPage(id, handle, title, items);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-500">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fråga {i + 1}</span>
              <button type="button" onClick={() => removeItem(i)} className="text-xs text-rose-600 hover:text-rose-700">
                Ta bort
              </button>
            </div>
            <input
              value={item.q}
              onChange={(e) => updateItem(i, "q", e.target.value)}
              placeholder="Fråga"
              className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={item.a}
              onChange={(e) => updateItem(i, "a", e.target.value)}
              placeholder="Svar"
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={addItem} className="text-xs font-medium text-gray-600 hover:text-gray-900">
        + Lägg till fråga
      </button>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {saved && <div className="text-sm text-emerald-600">Sparat.</div>}
      <div>
        <button type="button" onClick={handleSave} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Spara"}
        </button>
      </div>
    </div>
  );
}
