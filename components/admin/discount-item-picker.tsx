"use client";

import { useEffect, useState } from "react";

export type PickerItem = { shopifyId: string; title: string };

/**
 * Picks the products/collections a discount's buy or get rule applies to. Discount eligibility
 * (lib/discounts.ts's qualifies()) matches by real Shopify product/collection ID -- a
 * manually-created product or collection has no shopify_id and can never be matched by any
 * discount rule, so it's excluded from this picker entirely rather than offered as a selection
 * that would silently never apply at checkout.
 */
export function DiscountItemPicker({
  itemType,
  selected,
  onChange,
  allCollections,
}: {
  itemType: "all" | "product" | "collection" | null;
  selected: PickerItem[];
  onChange: (items: PickerItem[]) => void;
  allCollections?: PickerItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (itemType !== "product" || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/discounts/search-items?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.items ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, itemType]);

  function add(item: PickerItem) {
    if (selected.some((s) => s.shopifyId === item.shopifyId)) return;
    onChange([...selected, item]);
    setQuery("");
    setResults([]);
  }

  function remove(shopifyId: string) {
    onChange(selected.filter((s) => s.shopifyId !== shopifyId));
  }

  function toggleCollection(item: PickerItem) {
    if (selected.some((s) => s.shopifyId === item.shopifyId)) remove(item.shopifyId);
    else add(item);
  }

  if (itemType === "all" || itemType === null) return null;

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s.shopifyId} className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
              {s.title}
              <button type="button" onClick={() => remove(s.shopifyId)} className="text-gray-400 hover:text-rose-600">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {itemType === "product" && (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök produkt att lägga till…"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          {loading && <div className="mt-1 text-xs text-gray-400">Söker…</div>}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {results.map((r) => (
                <button key={r.shopifyId} type="button" onClick={() => add(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {itemType === "collection" && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {(allCollections ?? []).map((c) => (
            <label key={c.shopifyId} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.some((s) => s.shopifyId === c.shopifyId)} onChange={() => toggleCollection(c)} />
              {c.title}
            </label>
          ))}
          {(allCollections ?? []).length === 0 && <p className="text-xs text-gray-400">Inga kollektioner med Shopify-ID hittades.</p>}
        </div>
      )}
    </div>
  );
}
