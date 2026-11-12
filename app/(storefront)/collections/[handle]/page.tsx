import type { Metadata } from "next";
import { CollectionView, collectionMetadata, collectionStaticParams } from "@/components/collection/collection-page";

// The default view (page 1, recommended sort) is generated ahead of time and refreshed every 60s,
// so it's served straight from the CDN. Any ?page= or ?sort= request is rewritten by middleware.ts
// to app/(storefront)/collections-view/[handle], which renders that variant per request.
export const revalidate = 60;

export async function generateStaticParams() {
  return collectionStaticParams();
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  return collectionMetadata((await params).handle);
}

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <CollectionView handle={handle} page={1} sort="manual" />;
}
