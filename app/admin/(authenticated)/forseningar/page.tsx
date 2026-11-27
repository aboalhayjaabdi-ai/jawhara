import { requireAdmin } from "@/lib/admin/auth";
import { listDelayCandidates, DELAY_NOTICE_CODE } from "@/lib/email/delay-notice";
import { sendDelayNoticeAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Förseningar: shipped orders whose latest delivery date (the range Shopify shows on the order) is
 * tomorrow or has passed, not yet e-mailed. Each parcel is checked on 17TRACK's website first; the
 * delay e-mail (with the discount code) is sent only for parcels that have not arrived.
 */
export default async function DelaysPage() {
  await requireAdmin();
  const rows = await listDelayCandidates();
  const all17 = `https://t.17track.net/sv#nums=${rows.flatMap((r) => r.trackingNumbers).slice(0, 40).join(",")}`;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Förseningar</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Skickade ordrar vars sista leveransdatum i Shopify är i morgon eller redan har passerat, och som inte har fått förseningsmejlet. Kolla varje paket på
          17TRACK först – skicka mejlet bara om paketet <strong>inte</strong> är levererat. Mejlet ber om ursäkt och ger koden {DELAY_NOTICE_CODE} (20 %, en gång per
          kund). Varje order kan bara få mejlet en gång.
        </p>
        {rows.length > 0 && (
          <a href={all17} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            Öppna alla på 17TRACK ({Math.min(40, rows.flatMap((r) => r.trackingNumbers).length)} spårningar)
          </a>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">Inga ordrar att kolla just nu.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Kund</th>
                <th className="px-3 py-2">Beställd</th>
                <th className="px-3 py-2">Sista leveransdag</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Spårning</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} className="border-t border-gray-100" data-order={r.orderNumber}>
                  <td className="px-3 py-2 font-medium">
                    <a href={`/admin/orders/${r.orderId}`} className="hover:underline">{r.orderNumber}</a>
                  </td>
                  <td className="px-3 py-2">{r.customerName}</td>
                  <td className="px-3 py-2">{r.orderedAt}</td>
                  <td className="px-3 py-2">{r.latestDelivery}</td>
                  <td className="px-3 py-2">
                    {r.daysLate > 0 ? <span className="font-semibold text-red-700">{r.daysLate} dagar sen</span> : r.daysLate === 0 ? <span className="text-amber-700">Sista dagen idag</span> : <span className="text-amber-700">Sista dagen i morgon</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.trackingNumbers.map((t) => (
                      <a key={t} href={`https://t.17track.net/sv#nums=${t}`} target="_blank" rel="noreferrer" className="block text-blue-700 hover:underline">{t}</a>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={sendDelayNoticeAction.bind(null, r.orderId)}>
                      <button type="submit" disabled={!r.email} className="rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40">
                        Skicka förseningsmejl
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
