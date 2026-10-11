"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function OrdersFilterBar() {
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
    router.push(`/admin/orders?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök ordernummer eller e-post…"
        className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => update({ status: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla betalstatusar</option>
        <option value="PAID">Betald</option>
        <option value="PENDING">Väntande</option>
        <option value="REFUNDED">Återbetald</option>
        <option value="PARTIALLY_REFUNDED">Delvis återbetald</option>
      </select>
      <select
        defaultValue={searchParams.get("fulfillment") ?? ""}
        onChange={(e) => update({ fulfillment: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla leveransstatusar</option>
        <option value="FULFILLED">Levererad</option>
        <option value="PARTIALLY_FULFILLED">Delvis levererad</option>
        <option value="UNFULFILLED">Ej levererad</option>
      </select>
      <select
        defaultValue={searchParams.get("provider") ?? ""}
        onChange={(e) => update({ provider: e.target.value || null })}
        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      >
        <option value="">Alla källor</option>
        <option value="shopify">Shopify</option>
        <option value="stripe">Stripe</option>
        <option value="manual">Manuell</option>
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
        <option value="total_price:desc">Högst summa</option>
        <option value="total_price:asc">Lägst summa</option>
      </select>
    </div>
  );
}
