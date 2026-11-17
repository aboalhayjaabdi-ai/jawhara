import type { Metadata } from "next";
import { CollectionView, collectionMetadata } from "@/components/collection/collection-page";

// The default view (page 1, recommended sort) is generated ahead of time and refreshed every 60s,
// so it's served straight from the CDN. Any ?page= or ?sort= request is rewritten by middleware.ts
// to app/(storefront)/collections-view/[handle], which renders that variant per request.
export const revalidate = 900; // admin edits refresh these pages at once (revalidatePath); this only bounds staleness from other changes (e.g. stock after orders)

// Not prerendered at build time: building every page on each deploy fired thousands of queries
// at the (small) Supabase database within minutes and took it down twice on 2026-11-17. Each page
// is rendered on its first visit instead and then cached (revalidate below), which spreads the
// load out; admin edits still refresh pages at once.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  return collectionMetadata((await params).handle);
}

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <CollectionView handle={handle} page={1} sort="manual" />;
}
