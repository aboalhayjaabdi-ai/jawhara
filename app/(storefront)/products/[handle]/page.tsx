import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductByHandle, isEligibleForGiftPromo, isEligibleForThreeForTwo } from "@/lib/queries";
import { PRODUCT_INTROS } from "@/lib/product-intros";
import { getColorOptions } from "@/lib/product-colors";
import { getProductTemplateContent } from "@/lib/product-templates";
import { ProductDetail } from "@/components/product/product-detail";
import { RelatedProducts } from "@/components/product/related-products";
import { ComplementaryProducts } from "@/components/product/complementary-products";
import { BLACK_MONTH } from "@/lib/campaign";

export const revalidate = 900; // admin edits refresh these pages at once (revalidatePath); this only bounds staleness from other changes (e.g. stock after orders)

// generateStaticParams is required for revalidate to take effect on this dynamic segment (without
// it the route compiled as "ƒ Dynamic" and was rendered on every request). It returns no handles:
// building every product on each deploy fired thousands of queries at the small Supabase database
// within minutes and took it down twice on 2026-11-17. Each page is rendered on its first visit
// instead (dynamicParams defaults to true) and then cached; admin edits still refresh it at once.
export async function generateStaticParams() {
  return [];
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

  const [content, giftPromoEligible, threeForTwoEligible, colorOptions] = await Promise.all([
    getProductTemplateContent(product.template_suffix),
    isEligibleForGiftPromo(product.id, product.shopify_id ?? null),
    isEligibleForThreeForTwo(product.id),
    getColorOptions(product.handle),
  ]);

  // Black Month additions (lib/campaign.ts). The 3 för 2 box only appears on products that are
  // genuinely in the live "3 för 2" discount's scope; the bag line only on bag templates.
  const isBag = (BLACK_MONTH.bagTemplateKeys as readonly string[]).includes(product.template_suffix ?? "");
  const promoBox = BLACK_MONTH.active && threeForTwoEligible ? { heading: BLACK_MONTH.threeForTwo.pdpHeading, body: BLACK_MONTH.threeForTwo.pdpBody } : null;
  const salePriceNote = BLACK_MONTH.active && isBag ? BLACK_MONTH.bagPriceNote : null;

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
      content={
        content && {
          ...content,
          // The product's own intro (lib/product-intros.ts) replaces the category template's.
          introParagraph: PRODUCT_INTROS[product.handle] ?? content.introParagraph,
          // The offer box's text only reaches the page when this product is in the live offer.
          offerMessage: giftPromoEligible ? content.offerMessage : null,
        }
      }
      relatedProducts={<RelatedProducts productId={product.id} excludeHandle={product.handle} />}
      complementaryProducts={<ComplementaryProducts productId={product.id} />}
      variantImageIndex={product.variantImageIndex}
      variantGallery={product.variantGallery}
      giftPromoEligible={giftPromoEligible}
      threeForTwoEligible={threeForTwoEligible}
      colorOptions={colorOptions}
      promoBox={promoBox}
      salePriceNote={salePriceNote}
    />
  );
}
