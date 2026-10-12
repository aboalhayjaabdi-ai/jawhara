import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductByHandle, isEligibleForWalletPromo } from "@/lib/queries";
import { getProductTemplateContent } from "@/lib/product-templates";
import { ProductDetail } from "@/components/product/product-detail";
import { RelatedProducts } from "@/components/product/related-products";

export const revalidate = 60;

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

  const [content, walletPromoEligible] = await Promise.all([
    getProductTemplateContent(product.template_suffix),
    isEligibleForWalletPromo(product.shopify_id ?? null),
  ]);

  return (
    <ProductDetail
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
      variantImageIndex={product.variantImageIndex}
      walletPromoEligible={walletPromoEligible}
    />
  );
}
