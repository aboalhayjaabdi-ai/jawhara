import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { RedirectsList, type RedirectRow } from "@/components/admin/redirects-list";

export const dynamic = "force-dynamic";

export default async function AdminRedirectsPage() {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.from("url_redirects").select("id, source_path, destination_path, created_at").order("created_at", { ascending: false });

  const rows: RedirectRow[] = (data ?? []).map((r) => ({
    id: r.id,
    sourcePath: r.source_path,
    destinationPath: r.destination_path,
    createdAt: r.created_at,
  }));

  return (
    <div className="max-w-2xl">
      <Link href="/admin/settings" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Inställningar
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Omdirigeringar</h1>
      <p className="mb-6 text-xs text-gray-500">
        Styr trafik från en gammal webbutiks-länk till en ny. Tillämpas direkt på hela webbutiken (inte admin-sidor).
      </p>
      <RedirectsList initial={rows} />
    </div>
  );
}
