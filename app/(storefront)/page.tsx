export const revalidate = 60; // re-fetch prices/stock/collection membership at most once a minute

import { getPublishedHomeSections } from "@/lib/queries";
import { SectionRenderer } from "@/components/home/section-registry";

// Section order/content is admin-editable via /admin/storefront (Phase 7's visual storefront
// editor) and lives in the `storefront_layouts` table (status='published') -- never hardcoded
// here. Seeded verbatim from the original 16 hardcoded sections; see migration
// 0021_phase7_storefront_seed.sql for the exact original content this replaced.
export default async function HomePage() {
  const sections = await getPublishedHomeSections();
  return (
    <>
      {sections.map((s) => (
        <SectionRenderer key={s.id} section={s} />
      ))}
    </>
  );
}
