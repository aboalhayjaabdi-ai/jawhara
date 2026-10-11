import { supabaseService } from "@/lib/supabase/service-client";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ACTION_LABELS: Record<string, string> = {
  "customers.create": "Kund skapad",
  "customers.update": "Kontaktuppgifter uppdaterade",
  "customers.update_note": "Anteckning uppdaterad",
  "customers.update_tags": "Taggar uppdaterade",
  "customers.update_marketing_consent": "Marknadsföringssamtycke ändrat",
  "customers.add_address": "Adress tillagd",
  "customers.update_address": "Adress uppdaterad",
  "customers.delete_address": "Adress borttagen",
  "customers.set_default_address": "Standardadress ändrad",
  "customers.export_data": "Personuppgifter exporterade (GDPR)",
  "customers.anonymize": "Kund anonymiserad (GDPR)",
  "customers.delete": "Kund raderad",
  "orders.create_fulfillment": "Order levererad",
  "orders.refund_stripe": "Order återbetald (Stripe)",
  "orders.refund_manual": "Order återbetald (manuellt)",
  "orders.cancel": "Order avbruten",
  "orders.create_return": "Retur registrerad",
  "orders.create_manual": "Manuell order skapad",
  "orders.mark_paid_manual": "Order markerad som betald",
};

/**
 * Merges this customer's own audit_log entries (entity_type='customer') with the lifecycle
 * events of their real orders (entity_type='order', entity_id in their order history) into one
 * timeline -- "relevant order and account events", not just customer-record edits. orderIds is
 * resolved by the caller (same customer_id-or-email matching used throughout this phase) so this
 * component never re-derives order ownership itself.
 */
export async function CustomerActivityTimeline({ customerId, orderIds }: { customerId: string; orderIds: string[] }) {
  const { data: entries } = await supabaseService
    .from("audit_log")
    .select("id, action, detail, created_at")
    .or(`and(entity_type.eq.customer,entity_id.eq.${customerId})${orderIds.length ? `,and(entity_type.eq.order,entity_id.in.(${orderIds.join(",")}))` : ""}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Aktivitet</div>
        <p className="text-sm text-gray-400">Ingen registrerad aktivitet ännu.</p>
      </div>
    );
  }

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
