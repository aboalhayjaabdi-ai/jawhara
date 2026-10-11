"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function CustomersFilterBar({ countries }: { countries: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [minSpent, setMinSpent] = useState(searchParams.get("minTotalSpent") ?? "");
  const [maxSpent, setMaxSpent] = useState(searchParams.get("maxTotalSpent") ?? "");

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/admin/customers?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök namn, e-post eller telefon…"
        className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select
        defaultValue={searchParams.get("country") ?? ""}
        onChange={(e) => update({ country: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla länder</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get("acceptsMarketing") ?? ""}
        onChange={(e) => update({ acceptsMarketing: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Marknadsföring: alla</option>
        <option value="yes">Godkänner marknadsföring</option>
        <option value="no">Godkänner inte</option>
      </select>
      <label className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600">
        <input type="checkbox" defaultChecked={searchParams.get("noOrders") === "1"} onChange={(e) => update({ noOrders: e.target.checked ? "1" : null })} />
        Inga beställningar
      </label>
      <input
        value={minSpent}
        onChange={(e) => setMinSpent(e.target.value)}
        onBlur={() => update({ minTotalSpent: minSpent || null })}
        placeholder="Min kr"
        type="number"
        className="w-24 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <input
        value={maxSpent}
        onChange={(e) => setMaxSpent(e.target.value)}
        onBlur={() => update({ maxTotalSpent: maxSpent || null })}
        placeholder="Max kr"
        type="number"
        className="w-24 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select
        defaultValue={`${searchParams.get("sort") ?? "created_at"}:${searchParams.get("dir") ?? "desc"}`}
        onChange={(e) => {
          const [sort, dir] = e.target.value.split(":");
          update({ sort, dir });
        }}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="created_at:desc">Senaste först</option>
        <option value="created_at:asc">Äldsta först</option>
        <option value="name:asc">Namn A–Ö</option>
        <option value="name:desc">Namn Ö–A</option>
        <option value="total_spent:desc">Mest köpt</option>
        <option value="order_count:desc">Flest ordrar</option>
        <option value="last_order_at:desc">Senaste beställning</option>
      </select>
    </div>
  );
}
