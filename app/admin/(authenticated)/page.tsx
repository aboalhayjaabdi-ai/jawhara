import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboardMetrics, getDashboardTasks, type DashboardRange } from "@/lib/admin/analytics";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { SalesTrendChart } from "@/components/admin/sales-trend-chart";

function formatSek(amount: number) {
  return `${Math.round(amount).toLocaleString("sv-SE")} kr`;
}

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "+100%" : null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function greeting() {
  const hour = new Date().getUTCHours();
  if (hour < 10) return "God morgon!";
  if (hour < 17) return "God dag!";
  return "God kväll!";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  // The dashboard shows sales/financial totals -- outside the restricted "fulfillment_staff"
  // role's allowed sections (orders + products only, see lib/admin/permissions.ts). middleware.ts
  // already redirects direct URL hits away from "/admin" for this role; this covers the one case
  // that can't (logging in / navigating to the bare root from inside the app).
  const admin = await requireAdmin();
  if (admin.role === "fulfillment_staff") redirect("/admin/orders");

  const { range: rangeParam, from, to } = await searchParams;
  const range = (rangeParam as DashboardRange) || "30d";

  // requireAdmin() above already resolved the signed-in user's email -- no need for a second,
  // redundant auth.getUser() network round-trip just to read it again.
  const [metrics, tasks] = await Promise.all([getDashboardMetrics(range, from, to), getDashboardTasks()]);

  const firstName = admin.email?.split("@")[0] ?? "";
  const salesChange = pctChange(metrics.totalSales, metrics.previous.totalSales);
  const ordersChange = pctChange(metrics.ordersCount, metrics.previous.ordersCount);

  const headlineTiles = [
    { label: "Total försäljning", value: formatSek(metrics.totalSales), change: salesChange },
    { label: "Ordrar", value: metrics.ordersCount.toLocaleString("sv-SE"), change: ordersChange },
    { label: "Genomsnittligt ordervärde", value: formatSek(metrics.aov), change: null },
    { label: "Sålda produkter", value: metrics.productsSold.toLocaleString("sv-SE"), change: null },
  ];

  const breakdownTiles = [
    { label: "Bruttoförsäljning", value: formatSek(metrics.grossSales) },
    { label: "Rabatter", value: `−${formatSek(metrics.discounts)}` },
    { label: "Returer", value: `−${formatSek(metrics.returns)}` },
    { label: "Nettoförsäljning", value: formatSek(metrics.netSales) },
    { label: "Frakt", value: formatSek(metrics.shipping) },
    { label: "Moms", value: formatSek(metrics.tax) },
    { label: "Återkommande kunder", value: metrics.returningCustomers.toLocaleString("sv-SE") },
    { label: "Nya kunder", value: metrics.newCustomers.toLocaleString("sv-SE") },
  ];

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Översikt</h1>
        <DateRangePicker current={range} from={from} to={to} />
      </div>

      <div className="-mx-5 mb-8 flex gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {headlineTiles.map((t) => (
          <div key={t.label} className="min-w-[160px] flex-shrink-0 rounded-lg border border-gray-200 bg-white p-5 lg:min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-gray-900">{t.value}</span>
              {t.change && (
                <span className={`text-xs font-medium ${t.change.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{t.change}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900">
          {greeting()} {firstName && <span className="text-gray-400">({firstName})</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">Här är läget för Jawhara just nu.</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/orders"
          className="rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300"
        >
          <div className="text-sm text-gray-500">Att leverera</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{tasks.unfulfilledCount}</div>
          <div className="mt-1 text-xs text-gray-400">ordrar väntar på leverans</div>
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="text-sm text-gray-500">Lågt lager</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{tasks.lowStockCount}</div>
          <div className="mt-1 text-xs text-gray-400">varianter med 5 eller färre i lager</div>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Försäljningstrend</h2>
        <SalesTrendChart data={metrics.trend} />
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Försäljningsöversikt</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {breakdownTiles.map((t) => (
            <div key={t.label}>
              <div className="text-xs text-gray-500">{t.label}</div>
              <div className="mt-1 text-base font-semibold text-gray-900">{t.value}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-gray-400">
          Sessioner och konverteringsgrad visas här när Meta Pixel/GA4 är anslutet -- ingen spårning finns ännu, så inga påhittade
          siffror visas.
        </p>
      </div>

      {tasks.lowStock.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Produkter med lågt lager</h2>
            <Link href="/admin/products/inventory" className="text-xs font-medium text-gray-600 underline hover:text-gray-900">
              Visa alla ({tasks.lowStockCount})
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {tasks.lowStock.map((v) => (
              <a
                key={v.variantId}
                href={`/products/${v.productHandle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between py-2.5 text-sm hover:text-gray-900"
              >
                <div>
                  <span className="font-medium text-gray-900">{v.title}</span>
                  {v.option && <span className="ml-2 text-gray-400">{v.option}</span>}
                </div>
                <span className={`font-medium ${v.quantity <= 0 ? "text-rose-600" : "text-amber-600"}`}>{v.quantity} kvar</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
