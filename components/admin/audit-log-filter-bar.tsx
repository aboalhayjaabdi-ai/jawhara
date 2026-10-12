"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ENTITY_TYPES = [
  "collection",
  "content_page",
  "customer",
  "customer_saved_view",
  "discount",
  "order",
  "product",
  "product_template",
  "product_variant",
  "review",
  "store_settings",
  "storefront_layout",
  "storefront_menu",
  "storefront_menu_item",
  "url_redirect",
];

export function AuditLogFilterBar() {
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
    router.push(`/admin/audit-log?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && update({ q })}
        onBlur={() => update({ q })}
        placeholder="Sök åtgärd (t.ex. orders.refund)…"
        className="w-64 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
      />
      <select defaultValue={searchParams.get("entityType") ?? ""} onChange={(e) => update({ entityType: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <option value="">Alla typer</option>
        {ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input type="date" defaultValue={searchParams.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm" />
      <span className="text-xs text-gray-400">till</span>
      <input type="date" defaultValue={searchParams.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm" />
    </div>
  );
}
