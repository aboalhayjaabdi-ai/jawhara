import type { Metadata } from "next";
import { CollectionView, collectionMetadata, parseCollectionParams } from "@/components/collection/collection-page";

// Internal route: middleware.ts rewrites /collections/<handle>?page=… / ?sort=… here (the browser
// keeps the /collections/… URL). Reads searchParams, so it renders per request; the default view
// lives in app/(storefront)/collections/[handle] and is served statically.
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  return collectionMetadata((await params).handle);
}

export default async function CollectionVariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const { page, sort } = parseCollectionParams(sp);
  return <CollectionView handle={handle} page={page} sort={sort} />;
}
