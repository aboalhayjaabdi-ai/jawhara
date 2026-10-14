type FunnelStage = {
  label: string;
  value: number;
};

function formatCount(n: number) {
  return n.toLocaleString("sv-SE");
}

/**
 * Besök → Produktvisning → Varukorg → Kassa → Köp, each stage as a count + a bar sized relative
 * to "Besök" (the funnel's own 100% baseline) plus its own conversion percentage of Besök --
 * plain divs, not a recharts funnel (recharts has no funnel chart type), matching this admin's
 * existing "simple" visual language rather than pulling in another chart dependency.
 */
export function ConversionFunnel({ stages }: { stages: FunnelStage[] }) {
  const baseline = stages[0]?.value ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, i) => {
        const pct = baseline > 0 ? (stage.value / baseline) * 100 : 0;
        return (
          <div key={stage.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-900">
                {i + 1}. {stage.label}
              </span>
              <span className="text-gray-500">
                {formatCount(stage.value)}
                {i > 0 && <span className="ml-1.5 text-xs text-gray-400">({pct.toFixed(0)}%)</span>}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100">
              <div className="h-2.5 rounded-full bg-gray-900" style={{ width: `${Math.max(pct, stage.value > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
