import type { DiscountStats } from "@/lib/admin/discount-stats";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DiscountRedemptionsCard({ stats }: { stats: DiscountStats }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Användning &amp; rapport</div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500">Antal användningar</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.redemptionCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Tillskriven rabattsumma</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{formatSek(stats.attributedAmount)}</div>
        </div>
      </div>
      {stats.stackedOrderCount > 0 && (
        <p className="mb-3 text-xs text-amber-700">
          {stats.stackedOrderCount} av dessa ordrar hade även en annan rabatt tillämpad samtidigt -- den exakta uppdelningen av
          rabattbeloppet mellan dem går inte att fastställa (ingen summa visas för dessa, för att undvika att gissa).
        </p>
      )}
      {stats.redemptions.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="py-2">Order</th>
              <th className="py-2">Kund</th>
              <th className="py-2">Datum</th>
            </tr>
          </thead>
          <tbody>
            {stats.redemptions.map((r) => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="py-2">
                  <a href={`/admin/orders/${r.orderId}`} className="text-gray-900 underline">
                    {r.orderNumber ?? r.orderId.slice(0, 8)}
                  </a>
                </td>
                <td className="py-2 text-gray-500">{r.customerEmail ?? "—"}</td>
                <td className="py-2 text-gray-500">{formatDate(r.redeemedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-400">Inga användningar registrerade ännu.</p>
      )}
    </div>
  );
}
