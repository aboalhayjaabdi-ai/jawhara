"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ReviewsFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/admin/reviews?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök författare, text eller e-post…"
        className="w-64 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select defaultValue={searchParams.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla statusar</option>
        <option value="pending">Väntar</option>
        <option value="approved">Godkänd</option>
        <option value="rejected">Avvisad</option>
      </select>
      <select defaultValue={searchParams.get("rating") ?? ""} onChange={(e) => update({ rating: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla betyg</option>
        <option value="5">5 stjärnor</option>
        <option value="4">4 stjärnor</option>
        <option value="3">3 stjärnor</option>
        <option value="2">2 stjärnor</option>
        <option value="1">1 stjärna</option>
      </select>
      <select defaultValue={searchParams.get("source") ?? ""} onChange={(e) => update({ source: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla källor</option>
        <option value="judgeme">Judge.me</option>
        <option value="manual">Manuell</option>
      </select>
      <select defaultValue={searchParams.get("verified") ?? ""} onChange={(e) => update({ verified: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla köp</option>
        <option value="true">Endast verifierade köp</option>
        <option value="false">Ej verifierade</option>
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
        <option value="rating:desc">Högst betyg</option>
        <option value="rating:asc">Lägst betyg</option>
      </select>
    </div>
  );
}
