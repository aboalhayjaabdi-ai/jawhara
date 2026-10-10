import { getRelatedProductCards } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";

// Real theme: sections/product-recommendations.liquid, heading "Du kanske också gillar". Server
// Component so it can query Supabase directly -- product-detail.tsx is "use client" and can't
// render this itself, so it must be instantiated by the Server Component page and passed down.
export async function RelatedProducts({ productId, excludeHandle }: { productId: string; excludeHandle: string }) {
  const products = await getRelatedProductCards(productId, excludeHandle, 4);
  if (products.length === 0) return null;

  return (
    <div className="mt-16 border-t border-line pt-14">
      <h2 className="text-[26px]">Du kanske också gillar</h2>
      <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </div>
  );
}
