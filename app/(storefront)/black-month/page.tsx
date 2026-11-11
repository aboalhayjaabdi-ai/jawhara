import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLACK_MONTH } from "@/lib/campaign";
import { resolveProductList } from "@/lib/product-sections";
import { getCollectionProductIds } from "@/lib/queries";
import { getPrioritizedHBags, interleaveNoelle, resolveMixedJewelry } from "@/lib/campaign-products";
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

/**
 * Black Month landing page -- jewelry first, bags second:
 *   intro -> 3 för 2 band -> jewelry from every category -> Noélle/H bags -> more jewelry ->
 *   other Black Month bags (the Black Month collection, Jawhara admin -> Kollektioner) -> categories.
 * No product is shown twice on the page. All copy lives in lib/campaign.ts; setting
 * BLACK_MONTH.active = false turns this route into a 404.
 */
export default async function BlackMonthPage() {
  if (!BLACK_MONTH.active) notFound();

  const [jewelryOffers, jewelryIds, hBags] = await Promise.all([
    resolveMixedJewelry(page.jewelryOffers.limit),
    getCollectionProductIds(page.jewelryOffers.collectionHandle),
    getPrioritizedHBags(),
  ]);
  const shown = new Set(jewelryOffers.map((p) => p.id));
  // Noélle Väska and Noélle Väska Mini side by side, then any other H bags.
  const hBagOffers = interleaveNoelle(hBags).slice(0, page.hBagOffers.limit);
  for (const p of hBagOffers) shown.add(p.id);
  const moreJewelry = await resolveMixedJewelry(page.moreJewelry.limit, shown);
  for (const p of moreJewelry) shown.add(p.id);
  // The Black Month collection is mostly bags; jewelry in it is shown in the jewelry sections.
  const jewelrySet = new Set(jewelryIds);
  const bagOffers = (
    await resolveProductList({ collectionHandle: BLACK_MONTH.collectionHandle, limit: page.bagOffers.limit + shown.size + jewelrySet.size, unique: true }, shown)
  )
    .filter((p) => !jewelrySet.has(p.id))
    .slice(0, page.bagOffers.limit);

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

      {/* 3. Noélle-väskor till kampanjpris -- H bags, Noélle first, on a full-width band */}
      {hBagOffers.length > 0 && (
        <div className="bg-[#f7f7f7]">
          <ProductListSection
            id="vaskor"
            variant="campaign"
            layout="grid"
            heading={page.hBagOffers.heading}
            intro={page.hBagOffers.intro}
            collectionHandle="h-vaskor"
            limit={page.hBagOffers.limit}
            products={hBagOffers}
            buttonText={page.hBagOffers.buttonText}
            buttonHref={page.hBagOffers.buttonHref}
          />
        </div>
      )}

      {/* 4. Fler smycken att älska -- again from every jewelry category */}
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

      {/* 5. Fler väskor till kampanjpris -- the Black Month collection's other bags, compact carousel */}
      {bagOffers.length > 0 && (
        <div className="border-t border-line">
          <ProductListSection
            id="fler-vaskor"
            heading={page.bagOffers.heading}
            collectionHandle={BLACK_MONTH.collectionHandle}
            limit={page.bagOffers.limit}
            products={bagOffers}
            buttonText={page.bagOffers.buttonText}
            buttonHref={page.bagOffers.buttonHref}
          />
        </div>
      )}

      {/* 6. Shoppa efter kategori -- jewelry categories first */}
      <div className="border-t border-line">
        <CollectionLinks heading={page.categories.heading} handles={[...page.categories.handles]} />
      </div>
    </>
  );
}
