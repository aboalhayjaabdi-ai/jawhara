import { notFound } from "next/navigation";
import { getProductByHandle } from "@/lib/queries";
import { ProductDetail } from "@/components/product/product-detail";

export const revalidate = 60;

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
  if (!product) notFound();

  return (
    <ProductDetail
      title={product.title}
      handle={product.handle}
      descriptionHtml={product.description_html}
      images={product.images}
      variants={product.variants}
      sizeOptions={product.sizeOptions}
      reviews={product.reviews}
    />
  );
}
