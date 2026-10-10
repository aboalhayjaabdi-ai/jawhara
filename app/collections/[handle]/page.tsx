import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllProductCards, getCollectionMeta, getCollectionProductCards, getCollectionProductCount } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";

export const revalidate = 60;

const PAGE_SIZE = 24;

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

  return <CollectionGrid title={meta.title} description={meta.description_html} products={products} total={total} page={page} handle={handle} />;
}

function CollectionGrid({
  title,
  description,
  products,
  total,
  page,
  handle,
}: {
  title: string;
  description: string | null;
  products: { handle: string }[];
  total: number;
  page: number;
  handle: string;
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
