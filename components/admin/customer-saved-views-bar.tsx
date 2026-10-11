"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSavedView, deleteSavedView } from "@/app/admin/(authenticated)/customers/actions/saved-views";
import type { CustomersListFilters } from "@/lib/admin/customers-filters";

export type SavedView = { id: string; name: string; filters: CustomersListFilters };

const QUICK_SEGMENTS: { label: string; filters: Partial<CustomersListFilters> }[] = [
  { label: "Inga beställningar", filters: { noOrders: true } },
  { label: "Återkommande kunder (2+)", filters: { minOrderCount: 2 } },
  { label: "VIP (1000+ kr)", filters: { minTotalSpent: 1000 } },
  { label: "Godkänner marknadsföring", filters: { acceptsMarketing: "yes" } },
];

function filtersToParams(filters: Partial<CustomersListFilters>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  return params;
}

export function CustomerSavedViewsBar({ savedViews }: { savedViews: SavedView[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyFilters(filters: Partial<CustomersListFilters>) {
    router.push(`/admin/customers?${filtersToParams(filters).toString()}`);
  }

  function saveCurrent() {
    setError(null);
    if (!name.trim()) {
      setError("Ange ett namn.");
      return;
    }
    const current: CustomersListFilters = {
      q: searchParams.get("q") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      country: searchParams.get("country") ?? undefined,
      acceptsMarketing: (searchParams.get("acceptsMarketing") as "yes" | "no" | null) ?? undefined,
      noOrders: searchParams.get("noOrders") === "1",
      minTotalSpent: searchParams.get("minTotalSpent") ? Number(searchParams.get("minTotalSpent")) : undefined,
      maxTotalSpent: searchParams.get("maxTotalSpent") ? Number(searchParams.get("maxTotalSpent")) : undefined,
      minOrderCount: searchParams.get("minOrderCount") ? Number(searchParams.get("minOrderCount")) : undefined,
      maxOrderCount: searchParams.get("maxOrderCount") ? Number(searchParams.get("maxOrderCount")) : undefined,
      sort: (searchParams.get("sort") as CustomersListFilters["sort"]) ?? undefined,
      dir: (searchParams.get("dir") as CustomersListFilters["dir"]) ?? undefined,
    };
    startTransition(async () => {
      const result = await createSavedView(name, current);
      if (result.ok) {
        setSaving(false);
        setName("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteSavedView(id);
      router.refresh();
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-400">Snabbsegment:</span>
      {QUICK_SEGMENTS.map((seg) => (
        <button
          key={seg.label}
          type="button"
          onClick={() => applyFilters(seg.filters)}
          className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:bg-gray-50"
        >
          {seg.label}
        </button>
      ))}

      {savedViews.length > 0 && (
        <>
          <span className="ml-3 text-gray-400">Sparade vyer:</span>
          {savedViews.map((view) => (
            <span key={view.id} className="flex items-center gap-1 rounded-full border border-gray-200 pl-3 pr-1 py-1 text-gray-600">
              <button type="button" onClick={() => applyFilters(view.filters)} className="hover:underline">
                {view.name}
              </button>
              <button type="button" onClick={() => remove(view.id)} disabled={isPending} className="px-1 text-gray-300 hover:text-rose-600">
                ×
              </button>
            </span>
          ))}
        </>
      )}

      {!saving ? (
        <button type="button" onClick={() => setSaving(true)} className="ml-auto text-gray-500 underline hover:text-gray-900">
          Spara nuvarande filter som vy
        </button>
      ) : (
        <span className="ml-auto flex items-center gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vynamn" className="rounded-md border border-gray-200 px-2 py-1" />
          <button type="button" onClick={saveCurrent} disabled={isPending} className="rounded-md bg-gray-900 px-2 py-1 text-white">
            Spara
          </button>
          <button type="button" onClick={() => setSaving(false)} className="text-gray-400">
            Avbryt
          </button>
        </span>
      )}
      {error && <span className="w-full text-rose-600">{error}</span>}
    </div>
  );
}
