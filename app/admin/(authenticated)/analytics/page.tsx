import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getWebAnalyticsMetrics, type WebAnalyticsRange } from "@/lib/admin/web-analytics";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { VisitsTrendChart } from "@/components/admin/visits-trend-chart";
import { ConversionFunnel } from "@/components/admin/conversion-funnel";

const RANGE_OPTIONS: { value: WebAnalyticsRange; label: string }[] = [
  { value: "today", label: "Idag" },
  { value: "yesterday", label: "Igår" },
  { value: "7d", label: "7 dagar" },
  { value: "30d", label: "30 dagar" },
];

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  direct: "Direkt",
  other: "Övrigt",
};

function formatCount(n: number) {
  return n.toLocaleString("sv-SE");
}

function formatPct(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(0)}%` : "0%";
}

export default async function WebAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  // Behavioral + conversion data -- outside the restricted "fulfillment_staff" role's allowed
  // sections (same reasoning as the main dashboard, see app/admin/(authenticated)/page.tsx).
  // middleware.ts already blocks direct URL hits to any path outside its allowlist; this covers
  // in-app navigation to the bare section root the same way the dashboard's own guard does.
  const admin = await requireAdmin();
  if (admin.role === "fulfillment_staff") redirect("/admin/orders");

  const { range: rangeParam, from, to } = await searchParams;
  const range = (rangeParam as WebAnalyticsRange) || "30d";

  const metrics = await getWebAnalyticsMetrics(range, from, to);

  const headlineTiles = [
    { label: "Besök", value: formatCount(metrics.visits), sub: `${formatCount(metrics.uniqueVisitors)} unika besökare` },
    { label: "Produktvisningar", value: formatCount(metrics.productViews), sub: null },
    { label: "Genomförda köp", value: formatCount(metrics.purchases), sub: null },
    { label: "Konverteringsgrad", value: `${metrics.conversionRate.toFixed(1)}%`, sub: null },
  ];

  const secondaryTiles = [
    { label: "Lagt i varukorg", value: formatCount(metrics.addToCartSessions), sub: `${formatPct(metrics.addToCartSessions, metrics.visits)} av besöken` },
    { label: "Nått kassan", value: formatCount(metrics.checkoutSessions), sub: `${formatPct(metrics.checkoutSessions, metrics.visits)} av besöken` },
    { label: "Övergivna kassor", value: formatCount(metrics.abandonedCheckouts), sub: null },
  ];

  const funnelStages = [
    { label: "Besök", value: metrics.funnel.visits },
    { label: "Produktvisning", value: metrics.funnel.productViews },
    { label: "Varukorg", value: metrics.funnel.addToCart },
    { label: "Kassa", value: metrics.funnel.checkout },
    { label: "Köp", value: metrics.funnel.purchases },
  ];

  const totalTrafficSessions = metrics.trafficSources.reduce((sum, s) => sum + s.sessions, 0);

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Webbplatsstatistik</h1>
        <DateRangePicker current={range} from={from} to={to} basePath="/admin/analytics" options={RANGE_OPTIONS} />
      </div>

      <div className="-mx-5 mb-4 flex gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {headlineTiles.map((t) => (
          <div key={t.label} className="min-w-[160px] flex-shrink-0 rounded-lg border border-gray-200 bg-white p-5 lg:min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.label}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{t.value}</div>
            {t.sub && <div className="mt-1 text-xs text-gray-400">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="-mx-5 mb-8 flex gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {secondaryTiles.map((t) => (
          <div key={t.label} className="min-w-[160px] flex-shrink-0 rounded-lg border border-gray-200 bg-white p-5 lg:min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.label}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{t.value}</div>
            {t.sub && <div className="mt-1 text-xs text-gray-400">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Konverteringstratt</h2>
        <ConversionFunnel stages={funnelStages} />
      </div>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Besök över tid</h2>
        <VisitsTrendChart data={metrics.dailyVisits.map((d) => ({ date: d.date, visits: d.visits }))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Trafikkällor</h2>
          {metrics.trafficSources.length === 0 ? (
            <p className="text-sm text-gray-400">Inga besök under perioden.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {metrics.trafficSources.map((s) => (
                <div key={s.source}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{TRAFFIC_SOURCE_LABELS[s.source] ?? s.source}</span>
                    <span className="text-gray-500">
                      {formatCount(s.sessions)} <span className="text-xs text-gray-400">({formatPct(s.sessions, totalTrafficSessions)})</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-gray-900"
                      style={{ width: `${totalTrafficSessions > 0 ? (s.sessions / totalTrafficSessions) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Mest visade produkter</h2>
          {metrics.topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">Inga produktvisningar under perioden.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {metrics.topProducts.map((p) => (
                <a
                  key={p.productHandle}
                  href={`/products/${p.productHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between py-2.5 text-sm hover:text-gray-900"
                >
                  <span className="font-medium text-gray-900">{p.productTitle ?? p.productHandle}</span>
                  <span className="text-gray-500">{formatCount(p.views)} visningar</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
