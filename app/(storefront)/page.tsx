export const revalidate = 60; // re-fetch prices/stock/collection membership at most once a minute

import { getPublishedHomeSections } from "@/lib/queries";
import { SectionList } from "@/components/home/section-registry";
import { applyBlackMonthHomepage } from "@/lib/campaign-homepage";

// Section order/content is admin-editable via /admin/storefront (Phase 7's visual storefront
// editor) and lives in the `storefront_layouts` table (status='published') -- never hardcoded
// here. Seeded verbatim from the original 16 hardcoded sections; see migration
// 0021_phase7_storefront_seed.sql for the exact original content this replaced.
export default async function HomePage() {
  // While Black Month is active, a campaign layer puts jewelry first and H/Noélle bags ahead of
  // other bags (lib/campaign-homepage.ts); with the campaign off this is the admin layout as-is.
  const adminSections = await getPublishedHomeSections();
  const campaign = await applyBlackMonthHomepage(adminSections).catch((err) => {
    console.error("[homepage] Black Month layer failed, showing the admin layout as-is", err);
    return { sections: adminSections, presetProducts: new Map() };
  });
  return <SectionList sections={campaign.sections} allowHeaderOverlay presetProducts={campaign.presetProducts} />;
}
