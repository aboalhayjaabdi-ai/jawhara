import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductByHandle, getAllProductHandles, isEligibleForGiftPromo, isEligibleForThreeForTwo, getProductCollectionHandles } from "@/lib/queries";
import { getProductTemplateContent } from "@/lib/product-templates";
import { ProductDetail } from "@/components/product/product-detail";
import { RelatedProducts } from "@/components/product/related-products";
import { ComplementaryProducts } from "@/components/product/complementary-products";
import { BLACK_MONTH } from "@/lib/campaign";
import { getDeliveryTimeNote } from "@/lib/delivery-time";

export const revalidate = 60;

// Required for revalidate to actually take effect on this dynamic segment -- see
// getAllProductHandles's comment in lib/queries.ts for the full story (confirmed via the real
// build output: this route was always compiled "ƒ Dynamic", never respecting revalidate, without
// this). dynamicParams defaults to true, so a product added after this build still generates (and
// then caches) correctly on its own first visit.
export async function generateStaticParams() {
  const handles = await getAllProductHandles();
  return handles.map((handle) => ({ handle }));
}

function stripHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) return {};
  const title = product.seo_title || product.title;
  const description = product.seo_description || stripHtml(product.description_html);
  return {
    title,
    description,
    alternates: { canonical: `/products/${handle}` },
    openGraph: { title, description, images: product.images[0] ? [product.images[0]] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) notFound();

  const [content, giftPromoEligible, threeForTwoEligible, collectionHandles] = await Promise.all([
    getProductTemplateContent(product.template_suffix),
    isEligibleForGiftPromo(product.id, product.shopify_id ?? null),
    isEligibleForThreeForTwo(product.id),
    getProductCollectionHandles(product.id),
  ]);

  // Black Month additions (lib/campaign.ts). The 3 för 2 box only appears on products that are
  // genuinely in the live "3 för 2" discount's scope; the bag line only on bag templates.
  const isBag = (BLACK_MONTH.bagTemplateKeys as readonly string[]).includes(product.template_suffix ?? "");
  const promoBox = BLACK_MONTH.active && threeForTwoEligible ? { heading: BLACK_MONTH.threeForTwo.pdpHeading, body: BLACK_MONTH.threeForTwo.pdpBody } : null;
  const salePriceNote = BLACK_MONTH.active && isBag ? BLACK_MONTH.bagPriceNote : null;
  // Bag delivery-time box (lib/delivery-time.ts): "H väskor" (incl. Noélle Mini) -> regular, other bags -> 3–4 weeks.
  const deliveryTimeNote = getDeliveryTimeNote(collectionHandles);

  return (
    <ProductDetail
      productId={product.id}
      title={product.title}
      handle={product.handle}
      status={product.status}
      descriptionHtml={product.description_html}
      images={product.images}
      variants={product.variants}
      sizeOptions={product.sizeOptions}
      reviews={product.reviews}
      content={content}
      relatedProducts={<RelatedProducts productId={product.id} excludeHandle={product.handle} />}
      complementaryProducts={<ComplementaryProducts productId={product.id} />}
      variantImageIndex={product.variantImageIndex}
      variantGallery={product.variantGallery}
      giftPromoEligible={giftPromoEligible}
      threeForTwoEligible={threeForTwoEligible}
      promoBox={promoBox}
      salePriceNote={salePriceNote}
      deliveryTimeNote={deliveryTimeNote}
    />
  );
}
