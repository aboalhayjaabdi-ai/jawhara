import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllProductCards, getCollectionMeta, getCollectionProductCards, getCollectionProductCount } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";
import { SubcategoryTiles } from "@/components/collection/subcategory-tiles";

export const revalidate = 60;

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  if (handle === "all") {
    // Shopify's reserved /collections/all route has no backing collection row, so no
    // real SEO title/description exists for it in the export -- see docs for this gap.
    return { title: "Alla produkter", alternates: { canonical: "/collections/all" } };
  }
  const meta = await getCollectionMeta(handle);
  if (!meta) return {};
  const title = meta.seo_title || meta.title;
  const description = meta.seo_description || (meta.description_html ? meta.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : undefined);
  return { title, description, alternates: { canonical: `/collections/${handle}` } };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { handle } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (handle === "all") {
    const { cards, total } = await getAllProductCards(PAGE_SIZE, offset);
    if (cards.length === 0 && page === 1) notFound();
    return <CollectionGrid title="Alla produkter" description={null} products={cards} total={total} page={page} handle={handle} />;
  }

  const meta = await getCollectionMeta(handle);
  if (!meta) notFound();

  const [products, total] = await Promise.all([
    getCollectionProductCards(handle, PAGE_SIZE, offset),
    getCollectionProductCount(handle),
  ]);

  return (
    <CollectionGrid
      title={meta.title}
      description={meta.description_html}
      products={products}
      total={total}
      page={page}
      handle={handle}
      templateSuffix={meta.template_suffix}
    />
  );
}

function CollectionGrid({
  title,
  description,
  products,
  total,
  page,
  handle,
  templateSuffix = null,
}: {
  title: string;
  description: string | null;
  products: { handle: string }[];
  total: number;
  page: number;
  handle: string;
  templateSuffix?: string | null;
}) {
  const hasNextPage = page * PAGE_SIZE < total;
  return (
    <div className="mx-auto max-w-[1328px] px-6 py-14 lg:px-14">
      <div className="pb-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">
          {total} {total === 1 ? "PRODUKT" : "PRODUKTER"}
        </div>
        <h1 className="mt-3 text-4xl">{title}</h1>
        {description && <div className="mx-auto mt-3 max-w-xl text-sm text-muted" dangerouslySetInnerHTML={{ __html: description }} />}
      </div>

      <SubcategoryTiles templateSuffix={templateSuffix} />

      <div className="grid grid-cols-2 gap-6 border-t border-line pt-10 lg:grid-cols-4 lg:gap-7">
        {products.map((p: any) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>

      {hasNextPage && (
        <div className="mt-14 text-center">
          <Link href={`/collections/${handle}?page=${page + 1}`} className="border-b border-fg text-xs font-semibold uppercase tracking-wide">
            Ladda fler produkter
          </Link>
        </div>
      )}
    </div>
  );
}
