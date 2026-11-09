"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "manual", label: "Rekommenderat" },
  { value: "price-asc", label: "Pris: lågt till högt" },
  { value: "price-desc", label: "Pris: högt till lågt" },
  { value: "title-asc", label: "Namn: A-Ö" },
  { value: "title-desc", label: "Namn: Ö-A" },
  { value: "created-desc", label: "Nyast" },
];

export function SortFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete("page"); // any sort change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-start gap-4 border-b border-line pb-6 lg:justify-end">
      <select
        value={searchParams.get("sort") ?? "manual"}
        onChange={(e) => updateParam("sort", e.target.value === "manual" ? null : e.target.value)}
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
