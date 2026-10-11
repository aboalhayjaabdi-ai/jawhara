"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function DiscountsFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/admin/discounts?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök titel eller kod…"
        className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select defaultValue={searchParams.get("kind") ?? ""} onChange={(e) => update({ kind: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla typer</option>
        <option value="automatic">Automatisk</option>
        <option value="code">Kod</option>
      </select>
      <select defaultValue={searchParams.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla statusar</option>
        <option value="draft">Utkast</option>
        <option value="scheduled">Schemalagd</option>
        <option value="active">Aktiv</option>
        <option value="expired">Utgången</option>
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
        <option value="starts_at:desc">Startdatum</option>
      </select>
    </div>
  );
}
