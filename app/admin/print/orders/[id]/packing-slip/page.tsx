import { notFound } from "next/navigation";
import { supabaseService } from "@/lib/supabase/service-client";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, created_at, phone, email, shipping_address_id, customers(first_name, last_name)")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: address }] = await Promise.all([
    supabaseService.from("order_items").select("title, sku, quantity").eq("order_id", order.id),
    order.shipping_address_id
      ? supabaseService
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, zip, country, phone")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customer = order.customers as any;

  return (
    <div className="mx-auto max-w-2xl px-8 py-10 text-gray-900">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-wide">JAWHARA</div>
          <div className="mt-1 text-sm text-gray-500">Följesedel</div>
        </div>
        <PrintButton />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Order</div>
          <div className="mt-1 font-medium">{order.order_number}</div>
          <div className="text-gray-500">{formatDate(order.created_at)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Leveransadress</div>
          {address ? (
            <div className="mt-1">
              <div>{[address.first_name, address.last_name].filter(Boolean).join(" ")}</div>
              <div>{address.address1}</div>
              {address.address2 && <div>{address.address2}</div>}
              <div>
                {address.zip} {address.city}
              </div>
              <div>{address.country}</div>
            </div>
          ) : (
            <div className="mt-1 text-gray-400">
              {[customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || order.email || "—"}
            </div>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="py-2">Artikel</th>
            <th className="py-2 text-right">Antal</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2">
                {item.title}
                {item.sku && <span className="ml-2 text-xs text-gray-400">{item.sku}</span>}
              </td>
              <td className="py-2 text-right">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`@media print { button { display: none !important; } }`}</style>
    </div>
  );
}
