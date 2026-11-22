import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLACK_MONTH } from "@/lib/campaign";
import { resolveProductList } from "@/lib/product-sections";
import { getCollectionProductIds } from "@/lib/queries";
import { resolveMixedJewelry } from "@/lib/campaign-products";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";

export const revalidate = 900; // admin edits refresh these pages at once (revalidatePath); this only bounds staleness from other changes (e.g. stock after orders)

const page = BLACK_MONTH.page;

export const metadata: Metadata = {
  title: page.seoTitle,
  description: page.seoDescription,
  alternates: { canonical: BLACK_MONTH.path },
  openGraph: { title: `${page.seoTitle} | Jawhara`, description: page.seoDescription, url: BLACK_MONTH.path },
};

// Every line here is a verified, standing offer -- see lib/campaign.ts.
const BENEFITS = ["Bästsäljande väskor till kampanjpris", "3 för 2 på alla smycken", "Fri frakt inom Sverige"];

const JEWELRY_CATEGORIES = [
  { title: "Armband", href: "/collections/armband" },
  { title: "Halsband", href: "/collections/halsband" },
  { title: "Örhängen", href: "/collections/orhangen" },
  { title: "Ringar", href: "/collections/ringar" },
];

/**
 * Black Week landing page -- bags first, then jewelry:
 *   intro -> the best-selling bags -> 3 för 2 band -> jewelry from every category -> more best-selling
 *   bags -> more jewelry -> categories (bags first).
 * "Best-selling" = real units sold over the last 90 days (lib/product-sections.ts). No product is
 * shown twice on the page. All copy lives in lib/campaign.ts; setting BLACK_MONTH.active = false
 * turns this route into a 404.
 */
export default async function BlackMonthPage() {
  if (!BLACK_MONTH.active) notFound();

  const [rankedBags, jewelryIds, jewelryOffers] = await Promise.all([
    resolveProductList({ collectionHandle: page.bestBags.collectionHandle, limit: 80, sort: "best-selling" }),
    getCollectionProductIds(page.jewelryOffers.collectionHandle),
    resolveMixedJewelry(page.jewelryOffers.limit),
  ]);
  const jewelrySet = new Set(jewelryIds);
  const bags = rankedBags.filter((p) => p.available && !jewelrySet.has(p.id));
  const bestBags = bags.slice(0, page.bestBags.limit);
  const moreBags = bags.slice(page.bestBags.limit, page.bestBags.limit + page.bagOffers.limit);
  const shown = new Set([...bestBags, ...jewelryOffers, ...moreBags].map((p) => p.id));
  const moreJewelry = await resolveMixedJewelry(page.moreJewelry.limit, shown);

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

      {/* 1. Våra mest sålda väskor -- the best-selling bags */}
      <ProductListSection
        id="vaskor"
        variant="campaign"
        layout="grid"
        heading={page.bestBags.heading}
        intro={page.bestBags.intro}
        collectionHandle={page.bestBags.collectionHandle}
        limit={page.bestBags.limit}
        products={bestBags}
        priorityImages={4}
        buttonText={page.bestBags.buttonText}
        buttonHref={page.bestBags.buttonHref}
      />

      {/* 2. 3 för 2 på alla smycken */}
      <section className="bg-fg text-bg">
        <div className="mx-auto max-w-[880px] px-6 py-12 text-center sm:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bg/70">{BLACK_MONTH.name}</p>
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

      {/* 3. Smycken till kampanjpris -- from every jewelry category */}
      <ProductListSection
        id="smycken"
        variant="campaign"
        layout="grid"
        heading={page.jewelryOffers.heading}
        intro={page.jewelryOffers.intro}
        collectionHandle={page.jewelryOffers.collectionHandle}
        limit={page.jewelryOffers.limit}
        products={jewelryOffers}
        buttonText={page.jewelryOffers.buttonText}
      />

      {/* 4. Fler väskor till kampanjpris -- the next best-selling bags, on a full-width band */}
      {moreBags.length > 0 && (
        <div className="bg-[#f7f7f7]">
          <ProductListSection
            id="fler-vaskor"
            variant="campaign"
            layout="grid"
            heading={page.bagOffers.heading}
            collectionHandle={page.bestBags.collectionHandle}
            limit={page.bagOffers.limit}
            products={moreBags}
            buttonText={page.bagOffers.buttonText}
            buttonHref={page.bagOffers.buttonHref}
          />
        </div>
      )}

      {/* 5. Fler smycken att älska */}
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

      {/* 6. Shoppa efter kategori -- bags first */}
      <div className="border-t border-line">
        <CollectionLinks heading={page.categories.heading} handles={[...page.categories.handles]} />
      </div>
    </>
  );
}
