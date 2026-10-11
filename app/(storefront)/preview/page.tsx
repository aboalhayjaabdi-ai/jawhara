import { requireAdmin } from "@/lib/admin/auth";
import { getDraftSections, getVersionSections } from "@/lib/admin/storefront-layout";
import { SectionRenderer } from "@/components/home/section-registry";

export const dynamic = "force-dynamic";

/**
 * Admin-only preview of the homepage's draft (default) or a specific historical version
 * (?version=N, read-only) -- lives inside the real (storefront) route group so it inherits the
 * exact same Header/Footer/fonts/CartProvider chrome as production, and renders through the same
 * SectionRenderer as app/(storefront)/page.tsx, so what's previewed here is exactly what
 * publishing would produce. Never public: redirects to /admin/login for anyone who isn't a real
 * admin, since draft content is not meant to be visible to shoppers.
 */
export default async function StorefrontPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();

  const sp = await searchParams;
  const versionParam = Array.isArray(sp.version) ? sp.version[0] : sp.version;
  const version = versionParam ? Number(versionParam) : null;

  const sections = version ? await getVersionSections("home", version) : await getDraftSections("home");

  return (
    <>
      <div className="sticky top-0 z-40 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-amber-950">
        {version ? `Förhandsgranskning — version ${version} (ej publicerad)` : "Förhandsgranskning — utkast (ej publicerad)"}
      </div>
      {(sections ?? []).map((s) => (
        <SectionRenderer key={s.id} section={s} />
      ))}
    </>
  );
}
