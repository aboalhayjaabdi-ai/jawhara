import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { getCustomerStats } from "@/lib/admin/customer-stats";
import { CustomerCoreForm } from "@/components/admin/customer-core-form";
import { CustomerNotesTags } from "@/components/admin/customer-notes-tags";
import { CustomerMarketingConsent } from "@/components/admin/customer-marketing-consent";
import { CustomerAddressBook, type Address } from "@/components/admin/customer-address-book";
import { CustomerActivityTimeline } from "@/components/admin/customer-activity-timeline";
import { CustomerGdprActions } from "@/components/admin/customer-gdpr-actions";

export const dynamic = "force-dynamic";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

const FINANCIAL_STATUS_LABEL: Record<string, string> = {
  pending: "Väntar",
  paid: "Betald",
  voided: "Makulerad",
  refunded: "Återbetald",
  partially_refunded: "Delvis återbetald",
};

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_updated_at, note, tags, source, shopify_id, anonymized_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();

  const [{ data: addresses }, stats, { data: newsletterRow }] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, first_name, last_name, company, address1, address2, city, province, province_code, zip, country, country_code, phone, is_default")
      .eq("customer_id", id)
      .order("is_default", { ascending: false }),
    getCustomerStats(id),
    customer.email ? supabase.from("newsletter_subscribers").select("id").ilike("email", customer.email).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const orFilter = customer.email ? `customer_id.eq.${id},and(customer_id.is.null,email.ilike.${customer.email})` : `customer_id.eq.${id}`;
  const { data: orders } = await supabaseService
    .from("orders")
    .select("id, order_number, created_at, financial_status, fulfillment_status, total_price, currency_code, source, cancelled_at")
    .or(orFilter)
    .is("hidden_at", null)
    .order("created_at", { ascending: false });

  const addressRows: Address[] = (addresses ?? []).map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    company: a.company,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    province: a.province,
    provinceCode: a.province_code,
    zip: a.zip,
    country: a.country,
    countryCode: a.country_code,
    phone: a.phone,
    isDefault: a.is_default,
  }));

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email || "Namnlös kund";
  const aov = stats.orderCount > 0 ? stats.totalSpent / stats.orderCount : null;

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/customers" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
            ← Kunder
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${customer.source === "shopify" ? "bg-gray-100 text-gray-700" : "text-gray-400"}`}>
            {customer.source === "shopify" ? "Shopify" : "Manuell"}
          </span>
          {customer.anonymized_at && <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Anonymiserad</span>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Ordrar</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.orderCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Totalt köpt</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{formatSek(stats.totalSpent)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Genomsnittlig order</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{aov != null ? formatSek(aov) : "—"}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Senaste order</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—"}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <CustomerCoreForm customerId={id} initial={{ firstName: customer.first_name, lastName: customer.last_name, email: customer.email, phone: customer.phone }} />
          <CustomerNotesTags customerId={id} initialNote={customer.note} initialTags={customer.tags ?? []} />
          <CustomerAddressBook customerId={id} initialAddresses={addressRows} />

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Orderhistorik</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-2">Order</th>
                    <th className="px-5 py-2">Datum</th>
                    <th className="px-5 py-2">Status</th>
                    <th className="px-5 py-2">Källa</th>
                    <th className="px-5 py-2">Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders ?? []).map((o) => (
                    <tr key={o.id} className="border-b border-gray-50">
                      <td className="px-5 py-2">
                        <Link href={`/admin/orders/${o.id}`} className="font-medium text-gray-900 hover:underline">
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="px-5 py-2 text-gray-500">{formatDate(o.created_at)}</td>
                      <td className="px-5 py-2 text-gray-500">
                        {o.cancelled_at ? "Avbruten" : FINANCIAL_STATUS_LABEL[o.financial_status?.toLowerCase()] ?? o.financial_status}
                      </td>
                      <td className="px-5 py-2 text-gray-500">{o.source}</td>
                      <td className="px-5 py-2 text-gray-900">{formatSek(Number(o.total_price))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(orders ?? []).length === 0 && <p className="px-5 py-6 text-center text-sm text-gray-400">Inga ordrar.</p>}
            </div>
          </div>

          <CustomerActivityTimeline customerId={id} orderIds={(orders ?? []).map((o) => o.id)} />
        </div>

        <div className="space-y-6">
          <CustomerMarketingConsent
            customerId={id}
            initialAccepts={customer.accepts_marketing}
            consentUpdatedAt={customer.marketing_consent_updated_at}
            isNewsletterSubscriber={!!newsletterRow}
          />
          <CustomerGdprActions customerId={id} customerLabel={name} hasOrders={stats.orderCount > 0} />
        </div>
      </div>
    </div>
  );
}
