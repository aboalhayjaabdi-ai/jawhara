import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLACK_MONTH } from "@/lib/campaign";
import { resolveProductList } from "@/lib/product-sections";
import { getCollectionProductIds, type ProductCard as ProductCardType } from "@/lib/queries";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";

export const revalidate = 60; // same cadence as the homepage/collection pages (prices, stock, membership)

const page = BLACK_MONTH.page;

export const metadata: Metadata = {
  title: page.seoTitle,
  description: page.seoDescription,
  alternates: { canonical: BLACK_MONTH.path },
  openGraph: { title: `${page.seoTitle} | Jawhara`, description: page.seoDescription, url: BLACK_MONTH.path },
};

// Every line here is a verified, standing offer -- see lib/campaign.ts.
const BENEFITS = ["3 för 2 på alla smycken", "Smycken & väskor till kampanjpris", "Fri frakt inom Sverige"];

const JEWELRY_CATEGORIES = [
  { title: "Armband", href: "/collections/armband" },
  { title: "Halsband", href: "/collections/halsband" },
  { title: "Örhängen", href: "/collections/orhangen" },
  { title: "Ringar", href: "/collections/ringar" },
];

const onSale = (p: ProductCardType) => p.compareAtPrice != null && p.compareAtPrice > p.price;

/** Up to `limit` jewelry pieces at a Black Month price: real best-sellers first (sold in the last
 * 90 days), then the collection's own order. Falls back to plain best-sellers if too few are on
 * sale, so the section is never empty or thin. */
async function resolveJewelryOffers(limit: number): Promise<ProductCardType[]> {
  const handle = page.jewelryOffers.collectionHandle;
  const [bestSelling, manual] = await Promise.all([
    resolveProductList({ collectionHandle: handle, limit: limit * 3, sort: "best-selling" }),
    resolveProductList({ collectionHandle: handle, limit: limit * 5 }),
  ]);
  const seen = new Set<string>();
  const pool = [...bestSelling, ...manual].filter((p) => p.available && !seen.has(p.id) && seen.add(p.id));
  const discounted = pool.filter(onSale);
  return (discounted.length >= 4 ? discounted : pool).slice(0, limit);
}

/**
 * Black Month landing page -- jewelry first, bags second:
 *   intro -> 3 för 2 band -> jewelry at campaign price -> bags at campaign price (the Black Month
 *   collection, edited in Jawhara admin -> Kollektioner -> Black Month) -> more jewelry -> categories.
 * No product is shown twice on the page. All copy lives in lib/campaign.ts; setting
 * BLACK_MONTH.active = false turns this route into a 404.
 */
export default async function BlackMonthPage() {
  if (!BLACK_MONTH.active) notFound();

  const [jewelryOffers, jewelryIds] = await Promise.all([
    resolveJewelryOffers(page.jewelryOffers.limit),
    getCollectionProductIds(page.jewelryOffers.collectionHandle),
  ]);
  const shown = new Set(jewelryOffers.map((p) => p.id));
  // The Black Month collection is mostly bags; jewelry in it is shown in the jewelry sections.
  const jewelrySet = new Set(jewelryIds);
  const bagOffers = (
    await resolveProductList({ collectionHandle: BLACK_MONTH.collectionHandle, limit: page.bagOffers.limit + jewelrySet.size, unique: true }, shown)
  )
    .filter((p) => !jewelrySet.has(p.id))
    .slice(0, page.bagOffers.limit);
  for (const p of bagOffers) shown.add(p.id);
  const moreJewelry = await resolveProductList(
    { collectionHandle: page.moreJewelry.collectionHandle, limit: page.moreJewelry.limit, unique: true },
    shown
  );

  return (
    <>
      {/* Intro */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[880px] px-6 pb-10 pt-12 text-center sm:pb-14 sm:pt-16 lg:pt-20">
          <h1 className="font-serif text-[32px] font-medium uppercase leading-none tracking-[0.12em] sm:text-[52px] sm:tracking-[0.14em] lg:text-[64px]">{page.title}</h1>
          <div className="mx-auto mt-6 h-px w-12 bg-fg" aria-hidden />
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-7 text-muted sm:text-base">{page.subtitle}</p>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] sm:flex-row sm:justify-center sm:gap-0">
            {BENEFITS.map((b, i) => (
              <li key={b} className={`sm:whitespace-nowrap sm:px-5 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 1. 3 för 2 på alla smycken -- the headline offer */}
      <section className="bg-fg text-bg">
        <div className="mx-auto max-w-[880px] px-6 py-12 text-center sm:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bg/70">Black Month</p>
          <h2 className="mt-3 text-[24px] uppercase leading-tight tracking-[0.08em] sm:text-[34px]">{BLACK_MONTH.threeForTwo.heading}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-bg/80">{BLACK_MONTH.threeForTwo.pdpBody}</p>
          <nav aria-label="Smyckeskategorier" className="mx-auto mt-7 flex max-w-lg flex-wrap justify-center gap-2.5">
            {JEWELRY_CATEGORIES.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="btn-fx flex h-11 min-w-[104px] items-center justify-center border border-bg/40 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] hover:border-bg"
              >
                {c.title}
              </Link>
            ))}
          </nav>
          <Link
            href={`/collections/${page.jewelryOffers.collectionHandle}`}
            className="btn-fx mx-auto mt-4 flex h-12 w-full max-w-[240px] items-center justify-center bg-bg px-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg"
          >
            Shoppa alla smycken
          </Link>
        </div>
      </section>

      {/* 2. Smycken till kampanjpris */}
      <ProductListSection
        id="smycken"
        variant="campaign"
        layout="grid"
        heading={page.jewelryOffers.heading}
        intro={page.jewelryOffers.intro}
        collectionHandle={page.jewelryOffers.collectionHandle}
        limit={page.jewelryOffers.limit}
        products={jewelryOffers}
        priorityImages={4}
        buttonText={page.jewelryOffers.buttonText}
      />

      {/* 3. Väskor till kampanjpris -- the Black Month collection, on a full-width band */}
      {bagOffers.length > 0 && (
        <div className="bg-[#f7f7f7]">
          <ProductListSection
            id="vaskor"
            variant="campaign"
            layout="grid"
            heading={page.bagOffers.heading}
            intro={page.bagOffers.intro}
            collectionHandle={BLACK_MONTH.collectionHandle}
            limit={page.bagOffers.limit}
            products={bagOffers}
            buttonText={page.bagOffers.buttonText}
            buttonHref={page.bagOffers.buttonHref}
          />
        </div>
      )}

      {/* 4. Fler smycken att älska */}
      <ProductListSection
        id="fler-smycken"
        variant="campaign"
        layout="grid"
        heading={page.moreJewelry.heading}
        collectionHandle={page.moreJewelry.collectionHandle}
        limit={page.moreJewelry.limit}
        products={moreJewelry}
        buttonText={page.moreJewelry.buttonText}
      />

      {/* 5. Shoppa efter kategori -- jewelry categories first */}
      <div className="border-t border-line">
        <CollectionLinks heading={page.categories.heading} handles={[...page.categories.handles]} />
      </div>
    </>
  );
}
