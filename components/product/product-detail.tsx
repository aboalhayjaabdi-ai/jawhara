"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { isVariantAvailable } from "@/lib/inventory";

type Variant = {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  option1: string | null;
  inventory_quantity: number;
  inventory_tracked: boolean;
  inventory_policy: string | null;
};

type Review = {
  rating: number;
  author_name: string | null;
  body: string | null;
  verified_buyer: boolean;
  created_at: string;
};

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

function stars(rating: number) {
  return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
}

export function ProductDetail({
  title,
  handle,
  status,
  descriptionHtml,
  images,
  variants,
  sizeOptions,
  reviews,
}: {
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string | null;
  images: string[];
  variants: Variant[];
  sizeOptions: string[];
  reviews: Review[];
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(sizeOptions[0] ?? null);
  const { addItem } = useCart();

  const variant = useMemo(() => {
    if (!sizeOptions.length) return variants[0];
    return variants.find((v) => v.option1 === selectedOption) ?? variants[0];
  }, [variants, selectedOption, sizeOptions.length]);

  const onSale = variant?.compare_at_price != null && variant.compare_at_price > variant.price;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  return (
    <div className="mx-auto max-w-[1328px] px-6 py-7 lg:px-14">
      <div className="mb-3 text-xs text-muted">
        <a href="/">Hem</a> / {title}
      </div>

      <div className="grid gap-16 lg:grid-cols-[1fr_440px]">
        <div className="flex gap-4">
          <div className="hidden w-[76px] flex-shrink-0 flex-col gap-3 lg:flex">
            {images.map((img) => (
              <div key={img} className="aspect-[1/1.25] overflow-hidden border border-line bg-[#f4f4f4]">
                <Image src={img} alt={title} width={76} height={95} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
          <div className="relative flex-1 aspect-[1/1.25] overflow-hidden bg-[#f4f4f4]">
            {images[0] && (
              <Image src={images[0]} alt={title} fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
            )}
            {onSale && (
              <div className="absolute left-4 top-4 bg-fg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-bg">
                Rea
              </div>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-[30px]">{title}</h1>
          {variant?.sku && <div className="mt-1.5 text-xs text-muted">{variant.sku}</div>}
          {avgRating != null && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-xs">{stars(avgRating)}</span>
              <span className="text-xs text-muted">
                {avgRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? "recension" : "recensioner"})
              </span>
            </div>
          )}
          {variant && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-xl font-semibold">{formatSek(variant.price)}</span>
              {onSale && <span className="text-sm text-muted line-through">{formatSek(variant.compare_at_price!)}</span>}
            </div>
          )}

          {sizeOptions.length > 1 && (
            <div className="mt-8">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Storlek — {selectedOption} vald
              </div>
              <div className="flex flex-wrap gap-2.5">
                {sizeOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelectedOption(opt)}
                    className={`flex h-11 min-w-11 items-center justify-center border px-3.5 text-xs ${
                      opt === selectedOption ? "border-fg bg-fg text-bg" : "border-line"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() =>
              variant &&
              addItem({
                variantId: variant.id,
                productHandle: handle,
                title,
                variantTitle: variant.title,
                price: variant.price,
                image: images[0] ?? null,
              })
            }
            disabled={!variant || !isVariantAvailable({ productStatus: status, inventoryTracked: variant.inventory_tracked, inventoryPolicy: variant.inventory_policy, inventoryQuantity: variant.inventory_quantity }, 1)}
            className="mt-7 flex h-14 w-full items-center justify-center bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {variant && isVariantAvailable({ productStatus: status, inventoryTracked: variant.inventory_tracked, inventoryPolicy: variant.inventory_policy, inventoryQuantity: variant.inventory_quantity }, 1)
              ? "Lägg till i varukorgen"
              : "Slut i lager"}
          </button>

          {descriptionHtml && (
            <div className="mt-10 border-t border-line pt-6">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Beskrivning</div>
              <div className="text-[13px] leading-7 text-muted [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
            </div>
          )}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="mt-16 border-t border-line pt-16">
          <div className="max-w-[760px]">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Recensioner</div>
            <h2 className="mt-2.5 text-[26px]">Vad kunder säger</h2>
            {avgRating != null && (
              <div className="mt-5 flex items-center gap-3">
                <span className="text-xl">{stars(avgRating)}</span>
                <span className="text-sm text-muted">
                  {avgRating.toFixed(1)} av 5 — {reviews.length} {reviews.length === 1 ? "recension" : "recensioner"}
                </span>
              </div>
            )}
            {reviews.map((r, i) => (
              <div key={i} className="mt-6 border-t border-line pt-6">
                <div className="text-xs tracking-wide">{stars(r.rating)}</div>
                {r.body && <p className="mt-3 text-sm leading-6">&ldquo;{r.body}&rdquo;</p>}
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {r.author_name ?? "Anonym"}
                  {r.verified_buyer && " · Verifierat köp"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
