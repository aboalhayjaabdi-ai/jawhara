import { supabaseService } from "@/lib/supabase/service-client";

const REASON_LABEL: Record<string, string> = {
  sale: "Försäljning",
  cancellation: "Avbruten order",
  return_restock: "Returnerat (återlagt)",
  manual_adjustment: "Manuell justering",
  received_stock: "Mottaget lager",
  damaged: "Skadat/kasserat",
  correction: "Rättelse",
  initial_import: "Initial import",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Per-variant "Lagerhistorik" -- reads the inventory_movements ledger (Phase 3) for every variant
 * on this product, newest first, so a variant's full stock-change history (sales, cancellations,
 * returns, received stock, manual corrections) is visible right on the product it belongs to.
 * Variants created before this ledger existed simply show no rows here -- there is nothing to
 * backfill for history before the ledger was built.
 */
export async function VariantStockHistory({ variants }: { variants: { id: string; label: string }[] }) {
  if (variants.length === 0) return null;
  const variantIds = variants.map((v) => v.id);
  const labelById = new Map(variants.map((v) => [v.id, v.label]));

  const { data: movements } = await supabaseService
    .from("inventory_movements")
    .select("id, variant_id, delta, reason, note, resulting_quantity, order_id, created_at, orders(order_number)")
    .in("variant_id", variantIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!movements || movements.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lagerhistorik</div>
        <p className="mt-2 text-sm text-gray-400">Ingen lagerhistorik ännu.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Lagerhistorik</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2">Datum</th>
              <th className="px-2 py-2">Variant</th>
              <th className="px-2 py-2">Ändring</th>
              <th className="px-2 py-2">Nytt antal</th>
              <th className="px-2 py-2">Anledning</th>
              <th className="px-2 py-2">Order</th>
              <th className="px-2 py-2">Anteckning</th>
            </tr>
          </thead>
          <tbody>
            {(movements as any[]).map((m) => (
              <tr key={m.id} className="border-b border-gray-50">
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(m.created_at)}</td>
                <td className="px-2 py-2 text-xs">{labelById.get(m.variant_id) ?? "—"}</td>
                <td className={`px-2 py-2 font-medium ${m.delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                <td className="px-2 py-2 text-xs text-gray-500">{m.resulting_quantity}</td>
                <td className="px-2 py-2 text-xs">{REASON_LABEL[m.reason] ?? m.reason}</td>
                <td className="px-2 py-2 text-xs text-gray-500">{m.orders?.order_number ?? "—"}</td>
                <td className="px-2 py-2 text-xs text-gray-400">{m.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
