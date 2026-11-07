import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLACK_MONTH } from "@/lib/campaign";
import { resolveProductListsInOrder } from "@/lib/product-sections";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";
import { ProductCard } from "@/components/product/product-card";

export const revalidate = 60; // same cadence as the homepage/collection pages (prices, stock, membership)

const page = BLACK_MONTH.page;

export const metadata: Metadata = {
  title: page.seoTitle,
  description: page.seoDescription,
  alternates: { canonical: BLACK_MONTH.path },
  openGraph: { title: `${page.seoTitle} | Jawhara`, description: page.seoDescription, url: BLACK_MONTH.path },
};

// Every line here is a verified, standing offer -- see lib/campaign.ts.
const BENEFITS = ["Utvalda kampanjpriser", "3 för 2 på alla smycken", "Fri frakt inom Sverige"];

/**
 * Black Month landing page. Section 1 is the Shopify/Supabase "Black Month" collection (edit its
 * products in Jawhara admin -> Kollektioner -> Black Month); the bag and jewelry sections pull from
 * the existing collections and skip anything already shown above, so nothing repeats on the page.
 * All copy lives in lib/campaign.ts; setting BLACK_MONTH.active = false turns this route into a 404.
 */
export default async function BlackMonthPage() {
  if (!BLACK_MONTH.active) notFound();

  const lists = await resolveProductListsInOrder([
    { key: "offers", spec: { collectionHandle: BLACK_MONTH.collectionHandle, limit: page.offers.limit } },
    { key: "bags", spec: { collectionHandle: page.bags.collectionHandle, limit: page.bags.limit, unique: true } },
    { key: "jewelry", spec: { collectionHandle: page.jewelry.collectionHandle, limit: page.jewelry.limit, sort: "best-selling", unique: true } },
  ]);
  const jewelry = lists.get("jewelry") ?? [];

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

      {/* 1. Våra bästa erbjudanden -- the Black Month collection */}
      <ProductListSection
        id="erbjudanden"
        variant="campaign"
        layout="grid"
        heading={page.offers.heading}
        collectionHandle={BLACK_MONTH.collectionHandle}
        limit={page.offers.limit}
        products={lists.get("offers")}
        priorityImages={4}
        buttonText=""
      />

      {/* 2. Upptäck våra väskor -- main campaign category, full-width band for extra emphasis */}
      <div className="bg-[#f7f7f7]">
        <ProductListSection
          id="vaskor"
          variant="campaign"
          layout="grid"
          heading={page.bags.heading}
          intro="Tidlösa modeller i noggrant utvalda material – nu till kampanjpris."
          collectionHandle={page.bags.collectionHandle}
          limit={page.bags.limit}
          products={lists.get("bags")}
          buttonText={page.bags.buttonText}
          buttonHref={`/collections/${page.bags.collectionHandle}`}
        />
      </div>

      {/* 3. Smycken att älska -- with the 3 för 2 offer */}
      {jewelry.length > 0 && (
        <section id="smycken" className="mx-auto max-w-[1328px] scroll-mt-24 px-4 py-12 sm:px-6 lg:px-14 lg:py-16">
          <div className="mb-8 text-center lg:mb-10">
            <h2 className="text-[22px] uppercase leading-tight tracking-[0.06em] sm:text-[28px]">{page.jewelry.heading}</h2>
            <div className="mx-auto mt-4 h-px w-10 bg-fg" aria-hidden />
          </div>
          <div className="mx-auto mb-10 max-w-xl border border-fg px-6 py-6 text-center sm:py-7">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em] sm:text-sm">{BLACK_MONTH.threeForTwo.heading}</p>
            <p className="mt-2.5 text-sm leading-6 text-muted">{BLACK_MONTH.threeForTwo.body}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-10">
            {jewelry.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Link
              href={`/collections/${page.jewelry.collectionHandle}`}
              className="flex h-12 min-w-[240px] items-center justify-center bg-fg px-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-bg transition-opacity hover:opacity-85"
            >
              {page.jewelry.buttonText}
            </Link>
          </div>
        </section>
      )}

      {/* 4. Shoppa efter kategori */}
      <div className="border-t border-line">
        <CollectionLinks heading={page.categories.heading} handles={[...page.categories.handles]} />
      </div>
    </>
  );
}
