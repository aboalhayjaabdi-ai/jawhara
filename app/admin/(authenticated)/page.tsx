import { createAuthServerClient } from "@/lib/supabase/server-auth";

export default async function AdminDashboardPage() {
  const supabase = await createAuthServerClient();

  const [{ count: productCount }, { count: orderCount }, { count: pendingOrderCount }, { count: customerCount }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("financial_status", "pending"),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Produkter", value: productCount ?? 0 },
    { label: "Ordrar", value: orderCount ?? 0 },
    { label: "Väntande ordrar", value: pendingOrderCount ?? 0 },
    { label: "Kunder", value: customerCount ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-8 font-serif text-2xl">Översikt</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-line p-5">
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
