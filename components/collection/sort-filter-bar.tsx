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
    params.delete("page"); // any sort/filter change resets pagination
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
      <form
        className="flex flex-wrap items-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const params = new URLSearchParams(searchParams.toString());
          const minPrice = (form.elements.namedItem("minPrice") as HTMLInputElement).value;
          const maxPrice = (form.elements.namedItem("maxPrice") as HTMLInputElement).value;
          const inStock = (form.elements.namedItem("inStock") as HTMLInputElement).checked;
          minPrice ? params.set("minPrice", minPrice) : params.delete("minPrice");
          maxPrice ? params.set("maxPrice", maxPrice) : params.delete("maxPrice");
          inStock ? params.set("inStock", "1") : params.delete("inStock");
          params.delete("page");
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="inStock" defaultChecked={searchParams.get("inStock") === "1"} />
          Visa endast i lager
        </label>
        <input
          type="number"
          name="minPrice"
          placeholder="Min kr"
          defaultValue={searchParams.get("minPrice") ?? ""}
          className="h-9 w-24 border border-line px-2 text-xs"
        />
        <input
          type="number"
          name="maxPrice"
          placeholder="Max kr"
          defaultValue={searchParams.get("maxPrice") ?? ""}
          className="h-9 w-24 border border-line px-2 text-xs"
        />
        <button type="submit" className="h-9 border border-fg px-4 text-xs font-semibold uppercase tracking-wide">
          Filtrera
        </button>
      </form>

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
