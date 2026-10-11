"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ProductsFilterBar({ collections }: { collections: { id: string; title: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/admin/products?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök titel eller leverantör…"
        className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => update({ status: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla statusar</option>
        <option value="active">Aktiv</option>
        <option value="draft">Utkast</option>
        <option value="archived">Arkiverad</option>
      </select>
      <select
        defaultValue={searchParams.get("collectionId") ?? ""}
        onChange={(e) => update({ collectionId: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla kollektioner</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <select
        defaultValue={searchParams.get("stockLevel") ?? ""}
        onChange={(e) => update({ stockLevel: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Allt lager</option>
        <option value="low">Lågt lager</option>
        <option value="out">Slut i lager</option>
        <option value="untracked">Ospårat lager</option>
      </select>
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
        <option value="title:asc">Titel A–Ö</option>
        <option value="title:desc">Titel Ö–A</option>
      </select>
    </div>
  );
}
