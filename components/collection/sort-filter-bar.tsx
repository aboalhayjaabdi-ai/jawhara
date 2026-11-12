"use client";

import { useRouter } from "next/navigation";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "manual", label: "Rekommenderat" },
  { value: "price-asc", label: "Pris: lågt till högt" },
  { value: "price-desc", label: "Pris: högt till lågt" },
  { value: "title-asc", label: "Namn: A-Ö" },
  { value: "title-desc", label: "Namn: Ö-A" },
  { value: "created-desc", label: "Nyast" },
];

export function SortFilterBar({ basePath, currentSort }: { basePath: string; currentSort: string }) {
  const router = useRouter();

  // Any sort change resets pagination; the recommended sort is the plain (static) collection URL.
  function updateSort(value: string) {
    router.push(value === "manual" ? basePath : `${basePath}?sort=${encodeURIComponent(value)}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-start gap-4 border-b border-line pb-6 lg:justify-end">
      <select
        value={currentSort}
        onChange={(e) => updateSort(e.target.value)}
        className="h-9 border border-line px-2 text-xs"
        aria-label="Sortera"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
