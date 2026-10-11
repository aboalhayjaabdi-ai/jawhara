import type { DiscountImpact } from "@/lib/admin/discount-guard";

export function DiscountImpactWarning({ impact }: { impact: DiscountImpact }) {
  if (impact.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <div className="font-medium">Påverkar aktiva rabatter</div>
      <ul className="mt-1 list-inside list-disc">
        {impact.map((d) => (
          <li key={`${d.id}-${d.role}`}>{d.title}</li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-amber-700">
        Den här ändringen kan göra att rabatten slutar matcha den här varan eller kollektionen, utan felmeddelande.
      </p>
    </div>
  );
}
