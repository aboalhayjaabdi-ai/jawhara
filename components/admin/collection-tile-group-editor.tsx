"use client";

import { useState, useTransition } from "react";
import { addTileItem, removeTileItem, reorderTileItems } from "@/app/admin/(authenticated)/collections/[id]/actions/tiles";

export type TileItem = { id: string; collectionId: string; title: string };

export function CollectionTileGroupEditor({
  templateSuffix,
  initialItems,
  allCollections,
}: {
  templateSuffix: string;
  initialItems: TileItem[];
  allCollections: { id: string; title: string }[];
}) {
  const [items, setItems] = useState(initialItems);
  const [selectedToAdd, setSelectedToAdd] = useState(allCollections[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!selectedToAdd || items.some((i) => i.collectionId === selectedToAdd)) return;
    const collection = allCollections.find((c) => c.id === selectedToAdd);
    if (!collection) return;
    startTransition(async () => {
      const result = await addTileItem(templateSuffix, selectedToAdd);
      if (result.ok) setItems((prev) => [...prev, { id: `${templateSuffix}-${selectedToAdd}`, collectionId: selectedToAdd, title: collection.title }]);
    });
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => {
      removeTileItem(id);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    startTransition(() => {
      reorderTileItems(templateSuffix, next.map((i) => i.id));
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Underkategori-rutor (mall: {templateSuffix})</div>

      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
            <span className="flex-1 text-gray-900">{item.title}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-gray-400 hover:text-gray-900 disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-xs text-gray-400 hover:text-gray-900 disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => remove(item.id)} className="text-xs text-rose-600 hover:text-rose-700">
              Ta bort
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400">Inga rutor konfigurerade för denna mall.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <select value={selectedToAdd} onChange={(e) => setSelectedToAdd(e.target.value)} className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm">
          {allCollections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={isPending} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Lägg till
        </button>
      </div>
    </div>
  );
}
