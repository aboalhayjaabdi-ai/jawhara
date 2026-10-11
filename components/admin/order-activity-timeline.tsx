import { supabaseService } from "@/lib/supabase/service-client";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ACTION_LABELS: Record<string, string> = {
  "orders.update_note": "Anteckning uppdaterad",
  "orders.update_tags": "Taggar uppdaterade",
  "orders.create_fulfillment": "Leverans skapad",
  "orders.refund_stripe": "Återbetalning via Stripe",
  "orders.refund_manual": "Återbetalning registrerad manuellt",
  "orders.cancel": "Order avbruten",
  "orders.create_return": "Retur registrerad",
  "orders.sync_from_shopify": "Synkad från Shopify",
  "orders.export_csv": "Exporterad som CSV",
  "orders.bulk_fulfill": "Massleverans",
  "orders.create_manual": "Manuell order skapad",
  "orders.mark_paid_manual": "Markerad som betald manuellt",
};

/**
 * The first real consumer of audit_log (built in Phase 1, never previously written to). Only
 * shows Phase-2-onward admin actions on this order -- there is nothing earlier to backfill.
 */
export async function OrderActivityTimeline({ orderId }: { orderId: string }) {
  const { data: entries } = await supabaseService
    .from("audit_log")
    .select("id, action, detail, created_at")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .order("created_at", { ascending: false });

  if (!entries || entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Aktivitet</div>
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-gray-200 pl-3 text-sm">
            <div className="font-medium text-gray-900">{ACTION_LABELS[entry.action] ?? entry.action}</div>
            <div className="text-xs text-gray-400">{formatDate(entry.created_at)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
