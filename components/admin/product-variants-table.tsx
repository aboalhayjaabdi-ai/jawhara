"use client";

import { useState, useTransition } from "react";
import { isVariantAvailable } from "@/lib/inventory";
import { saveVariants, deleteVariant, type VariantPatch } from "@/app/admin/(authenticated)/products/[id]/actions/variants";
import { InventoryAdjustButton } from "@/components/admin/inventory-adjust-button";

type Variant = VariantPatch & { id: string };

function emptyVariant(): VariantPatch {
  return {
    title: "Default Title",
    sku: null,
    barcode: null,
    price: 0,
    compare_at_price: null,
    inventory_quantity: 0,
    inventory_tracked: true,
    inventory_policy: "DENY",
    weight: null,
    weight_unit: "kg",
    option1: null,
    option2: null,
    option3: null,
  };
}

export function ProductVariantsTable({ productId, productStatus, initialVariants }: { productId: string; productStatus: string; initialVariants: Variant[] }) {
  const [rows, setRows] = useState<(VariantPatch & { id?: string; key: string })[]>(
    initialVariants.map((v) => ({ ...v, key: v.id }))
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(key: string, patch: Partial<VariantPatch>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setMessage(null);
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyVariant(), key: `new-${Date.now()}` }]);
  }

  function removeRow(row: VariantPatch & { id?: string; key: string }) {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    if (rows.length <= 1) {
      setError("En produkt måste ha minst en variant.");
      return;
    }
    startTransition(async () => {
      const result = await deleteVariant(productId, row.id!);
      if (result.ok) setRows((prev) => prev.filter((r) => r.key !== row.key));
      else setError(result.error);
    });
  }

  function saveAll() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const patches: VariantPatch[] = rows.map(({ key, ...rest }) => rest);
      const result = await saveVariants(productId, patches);
      if (result.ok) setMessage("Alla varianter sparade.");
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Varianter</div>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs text-emerald-600">{message}</span>}
          <button type="button" onClick={addRow} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
            + Lägg till variant
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2">Alternativ</th>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">Streckkod</th>
              <th className="px-2 py-2">Pris</th>
              <th className="px-2 py-2">Jämförpris</th>
              <th className="px-2 py-2">Spårat lager</th>
              <th className="px-2 py-2">Lagerantal</th>
              <th className="px-2 py-2">Policy</th>
              <th className="px-2 py-2">Vikt</th>
              <th className="px-2 py-2">Tillgänglig</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const available = isVariantAvailable(
                {
                  productStatus,
                  inventoryTracked: row.inventory_tracked,
                  inventoryPolicy: row.inventory_policy,
                  inventoryQuantity: row.inventory_quantity,
                },
                1
              );
              return (
                <tr key={row.key} className="border-b border-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <input
                        value={row.option1 ?? ""}
                        onChange={(e) => update(row.key, { option1: e.target.value || null })}
                        placeholder="Alt 1"
                        className="w-20 rounded border border-gray-200 px-1.5 py-1 text-xs"
                      />
                      <input
                        value={row.option2 ?? ""}
                        onChange={(e) => update(row.key, { option2: e.target.value || null })}
                        placeholder="Alt 2"
                        className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input value={row.sku ?? ""} onChange={(e) => update(row.key, { sku: e.target.value || null })} className="w-24 rounded border border-gray-200 px-1.5 py-1 text-xs" />
                  </td>
                  <td className="px-2 py-2">
                    <input value={row.barcode ?? ""} onChange={(e) => update(row.key, { barcode: e.target.value || null })} className="w-24 rounded border border-gray-200 px-1.5 py-1 text-xs" />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => update(row.key, { price: Math.max(0, Number(e.target.value)) })}
                      className="w-20 rounded border border-gray-200 px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.compare_at_price ?? ""}
                      onChange={(e) => update(row.key, { compare_at_price: e.target.value ? Number(e.target.value) : null })}
                      className="w-20 rounded border border-gray-200 px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.inventory_tracked}
                      onChange={(e) => update(row.key, { inventory_tracked: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="relative px-2 py-2">
                    <input
                      type="number"
                      value={row.inventory_quantity}
                      disabled={!row.inventory_tracked}
                      onChange={(e) => update(row.key, { inventory_quantity: Number(e.target.value) })}
                      className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {!row.inventory_tracked && <div className="mt-0.5 text-[10px] text-gray-400">Alltid köpbar</div>}
                    {row.inventory_tracked && row.id && (
                      <InventoryAdjustButton
                        productId={productId}
                        variantId={row.id}
                        currentQuantity={row.inventory_quantity}
                        onAdjusted={(newQuantity) => update(row.key, { inventory_quantity: newQuantity })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.inventory_policy ?? "DENY"}
                      disabled={!row.inventory_tracked}
                      onChange={(e) => update(row.key, { inventory_policy: e.target.value as "DENY" | "CONTINUE" })}
                      className="rounded border border-gray-200 px-1.5 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="DENY">Stoppa</option>
                      <option value="CONTINUE">Fortsätt sälja</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.001"
                        value={row.weight ?? ""}
                        onChange={(e) => update(row.key, { weight: e.target.value ? Number(e.target.value) : null })}
                        className="w-14 rounded border border-gray-200 px-1.5 py-1 text-xs"
                      />
                      <select value={row.weight_unit} onChange={(e) => update(row.key, { weight_unit: e.target.value as "g" | "kg" })} className="rounded border border-gray-200 px-1 py-1 text-xs">
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={available ? "text-emerald-600" : "text-rose-600"}>{available ? "Ja" : "Nej"}</span>
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeRow(row)} className="text-xs text-rose-600 hover:text-rose-700">
                      Ta bort
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="px-5 py-2 text-sm text-rose-600">{error}</div>}

      <div className="border-t border-gray-100 px-5 py-3">
        <button
          type="button"
          onClick={saveAll}
          disabled={isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Sparar…" : "Spara alla"}
        </button>
      </div>
    </div>
  );
}
