import { getComplementaryProductCards } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";

// "Passar med" -- manually curated by the admin (product_complementary), entirely separate from
// the automatic "Du kanske också gillar" recommendations (components/product/related-products.tsx,
// which this never touches or merges with). Same Server Component pattern: product-detail.tsx is
// "use client" and can't query Supabase directly, so this is instantiated by the Server Component
// page and passed down as a prop.
export async function ComplementaryProducts({ productId }: { productId: string }) {
  const products = await getComplementaryProductCards(productId);
  if (products.length === 0) return null;

  return (
    <div className="mt-16 border-t border-line pt-14">
      <h2 className="text-[26px]">Passar med</h2>
      <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </div>
  );
}
