"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function quickRange(key: string): { from: string; to: string } {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  if (key === "today") return { from: isoDate(todayStart), to: isoDate(todayEnd) };
  if (key === "yesterday") {
    const y = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    return { from: isoDate(y), to: isoDate(todayStart) };
  }
  if (key === "last7") return { from: isoDate(new Date(todayStart.getTime() - 7 * 86400_000)), to: isoDate(todayEnd) };
  if (key === "last30") return { from: isoDate(new Date(todayStart.getTime() - 30 * 86400_000)), to: isoDate(todayEnd) };
  if (key === "thisMonth") {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: isoDate(monthStart), to: isoDate(todayEnd) };
  }
  return { from: "", to: "" };
}

export function OrdersFilterBar({ carriers }: { carriers: string[] }) {
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

  const view = searchParams.get("view") ?? "active";

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
          <option value="UNPAID">Obetald</option>
          <option value="PARTIALLY_PAID">Delvis betald</option>
          <option value="REFUNDED">Återbetald</option>
          <option value="PARTIALLY_REFUNDED">Delvis återbetald</option>
          <option value="CANCELLED">Avbruten</option>
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
        {carriers.length > 0 && (
          <select
            defaultValue={searchParams.get("carrier") ?? ""}
            onChange={(e) => update({ carrier: e.target.value || null })}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm"
          >
            <option value="">Alla transportörer</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
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

      <div className="flex flex-wrap items-center gap-2">
        <select
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            const { from, to } = quickRange(e.target.value);
            update({ date: null, from, to });
            e.target.value = "";
          }}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500"
        >
          <option value="">Snabbval datum…</option>
          <option value="today">Idag</option>
          <option value="yesterday">Igår</option>
          <option value="last7">Senaste 7 dagarna</option>
          <option value="last30">Senaste 30 dagarna</option>
          <option value="thisMonth">Denna månad</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Exakt datum
          <input
            type="date"
            defaultValue={searchParams.get("date") ?? ""}
            onChange={(e) => update({ date: e.target.value || null, from: null, to: null })}
            className="rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Från
          <input
            type="date"
            defaultValue={searchParams.get("from")?.slice(0, 10) ?? ""}
            onChange={(e) => update({ from: e.target.value || null, date: null })}
            className="rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Till
          <input
            type="date"
            defaultValue={searchParams.get("to")?.slice(0, 10) ?? ""}
            onChange={(e) => update({ to: e.target.value || null, date: null })}
            className="rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </label>

        <div className="ml-auto flex overflow-hidden rounded-md border border-gray-200 text-xs">
          <button
            type="button"
            onClick={() => update({ view: null })}
            className={`px-3 py-1.5 font-medium ${view === "active" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Ordrar
          </button>
          <button
            type="button"
            onClick={() => update({ view: "hidden" })}
            className={`border-l border-gray-200 px-3 py-1.5 font-medium ${view === "hidden" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Borttagna
          </button>
        </div>
      </div>
    </div>
  );
}
