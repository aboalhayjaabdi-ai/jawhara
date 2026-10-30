"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useCartActions } from "@/components/cart/cart-provider";
import { isVariantAvailable } from "@/lib/inventory";
import { normalizeVariantTitle } from "@/lib/variant-title";
import type { ProductTemplateContent } from "@/lib/product-templates";
import { addRecentlyViewed } from "@/lib/recently-viewed";
import { trackViewContent } from "@/lib/marketing/events";
import { ProductGallery } from "@/components/product/product-gallery";

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
  merchant_reply_body: string | null;
  merchant_reply_at: string | null;
};

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

function stars(rating: number) {
  return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
}

// Real theme: blocks/product-inventory.liquid, threshold 10, show_inventory_quantity true.
// Untracked variants never show a quantity or low-stock warning -- just "I lager".
const INVENTORY_LOW_STOCK_THRESHOLD = 10;

function inventoryStatusText(v: Variant): string {
  if (!v.inventory_tracked) return "I lager";
  if (v.inventory_quantity > INVENTORY_LOW_STOCK_THRESHOLD) return "I lager";
  if (v.inventory_quantity > 0) return `${v.inventory_quantity} kvar`;
  if (v.inventory_policy === "CONTINUE") return "I lager";
  return "Slut i lager";
}

// Small monochrome icons for the trust-line grid below -- matched to each line's content by
// keyword rather than a new data field, so lib/product-templates.ts's existing trustLines
// (plain strings, already authored per category) need no schema change to get icons.
function TrustIcon({ text }: { text: string }) {
  const t = text.toLowerCase();
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;
  if (t.includes("retur") || t.includes("öppet köp") || t.includes("byte")) {
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 1 1 3 6.7" />
        <path d="M3 21v-5h5" />
      </svg>
    );
  }
  if (t.includes("frakt")) {
    return (
      <svg {...common}>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="19" r="1.6" />
        <circle cx="17.5" cy="19" r="1.6" />
      </svg>
    );
  }
  if (t.includes("klarna") || t.includes("betala")) {
    return (
      <svg {...common}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="1.6" />
        <path d="M2.5 9.5h19" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Minimal, monochrome payment-method badges (outline + small-caps text, matching this page's own
// button/pill style elsewhere) -- never a colorful brand-logo row, which wouldn't fit the site's
// existing black-and-white visual language.
const PAYMENT_METHODS = ["Klarna", "Visa", "Mastercard", "Apple Pay", "Google Pay"];
function PaymentBadges() {
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {PAYMENT_METHODS.map((m) => (
        <span key={m} className="rounded-sm border border-line px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          {m}
        </span>
      ))}
    </div>
  );
}

function AccordionRow({ heading, body, defaultOpen = false }: { heading: string; body: string; defaultOpen?: boolean }) {
  return (
    <details className="group border-b border-line py-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-wide">
        {heading}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="transition-transform group-open:rotate-180" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3 text-[13px] leading-7 text-muted [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: body }} />
    </details>
  );
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
  content,
  relatedProducts,
  complementaryProducts,
  variantImageIndex,
  walletPromoEligible,
}: {
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string | null;
  images: string[];
  variants: Variant[];
  sizeOptions: string[];
  reviews: Review[];
  /** Resolved by the server-component parent (app/(storefront)/products/[handle]/page.tsx) via
   * the now-async, DB-backed getProductTemplateContent -- this client component can no longer
   * call that directly. */
  content: ProductTemplateContent | null;
  relatedProducts: React.ReactNode;
  /** "Passar med" -- manually curated, separate from relatedProducts' automatic recommendations. */
  complementaryProducts: React.ReactNode;
  /** Real per-variant image links (Shopify's own variant.image), keyed by variant id. */
  variantImageIndex: Record<string, number>;
  /** Resolved server-side by the parent page via lib/queries.ts's isEligibleForWalletPromo --
   * whether this product's real shopify_id is in the live "Valfri Plånbok" discount's
   * buy_item_ids. Gates the "Välj din plånbok här" link independently of content.offerMessage,
   * since some products share the same display template without being discount-eligible. */
  walletPromoEligible: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(sizeOptions[0] ?? null);
  const { addItem } = useCartActions();

  const variant = useMemo(() => {
    if (!sizeOptions.length) return variants[0];
    return variants.find((v) => v.option1 === selectedOption) ?? variants[0];
  }, [variants, selectedOption, sizeOptions.length]);

  const galleryJumpIndex = variant ? variantImageIndex[variant.id] : undefined;

  const onSale = variant?.compare_at_price != null && variant.compare_at_price > variant.price;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  useEffect(() => {
    if (!variant) return;
    addRecentlyViewed({
      title,
      handle,
      image: images[0] ?? null,
      price: variant.price,
      compareAtPrice: variant.compare_at_price,
      sku: variant.sku,
      available: isVariantAvailable(
        { productStatus: status, inventoryTracked: variant.inventory_tracked, inventoryPolicy: variant.inventory_policy, inventoryQuantity: variant.inventory_quantity },
        1
      ),
      quickAddVariantId: variants.length === 1 ? variants[0].id : null,
      // Recently-viewed is a flattened point-in-time snapshot (see lib/recently-viewed.ts) --
      // multi-variant quick-add there is out of scope for this round, same as before.
      variants: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  useEffect(() => {
    if (!variant) return;
    trackViewContent({ id: variant.id, title, price: variant.price, currency: "SEK", productHandle: handle });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, variant?.id]);

  return (
    <div className="mx-auto max-w-[1328px] px-6 py-7 lg:px-14">
      <div className="mb-3 text-xs text-muted">
        <a href="/">Hem</a> / {title}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_440px] lg:gap-16">
        <div className="relative">
          <ProductGallery images={images} title={title} layout={content?.galleryLayout ?? "grid"} jumpToIndex={galleryJumpIndex} />
          {onSale && (
            <div className="absolute left-4 top-4 z-10 bg-fg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-bg">
              Rea
            </div>
          )}
        </div>

        <div>
          <h1 className="text-[30px]">{title}</h1>
          {variant?.sku && <div className="mt-1.5 text-xs text-muted">{variant.sku}</div>}
          {avgRating != null && (
            <button
              type="button"
              onClick={() => document.getElementById("recensioner")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-2.5 flex items-center gap-2"
            >
              <span className="text-xs">{stars(avgRating)}</span>
              <span className="text-xs text-muted underline">
                {avgRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? "recension" : "recensioner"})
              </span>
            </button>
          )}
          {variant && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-xl font-semibold">{formatSek(variant.price)}</span>
              {onSale && <span className="text-sm text-muted line-through">{formatSek(variant.compare_at_price!)}</span>}
            </div>
          )}

          {content?.introParagraph && (
            <p className="mt-4 text-sm leading-6 text-muted">{content.introParagraph}</p>
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

          {content?.sizeGuideHref && (
            <Link href={content.sizeGuideHref} className="mt-3 inline-block border-b border-fg text-xs font-semibold">
              Storlekstabell
            </Link>
          )}

          {content?.offerMessage && (
            <div className="mt-6 border border-line bg-[#f7f7f7] p-4">
              <div className="text-sm font-semibold">{content.offerMessage.heading}</div>
              <p className="mt-1.5 text-xs leading-6 text-muted">{content.offerMessage.body}</p>
              {walletPromoEligible && content.offerMessage.href && (
                <Link href={content.offerMessage.href} className="mt-2.5 inline-block border-b border-fg text-xs font-semibold">
                  Välj din plånbok här →
                </Link>
              )}
            </div>
          )}

          {content?.showInventoryStatus && variant && status === "active" && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <span
                className={`h-1.5 w-1.5 rounded-full ${inventoryStatusText(variant) === "Slut i lager" ? "bg-rose-600" : "bg-emerald-600"}`}
                aria-hidden
              />
              {inventoryStatusText(variant)}
            </div>
          )}

          <button
            onClick={() =>
              variant &&
              addItem({
                variantId: variant.id,
                productHandle: handle,
                title,
                variantTitle: normalizeVariantTitle(variant.title) ?? "",
                price: variant.price,
                compareAtPrice: variant.compare_at_price,
                image: images[galleryJumpIndex ?? 0] ?? null,
              })
            }
            disabled={!variant || !isVariantAvailable({ productStatus: status, inventoryTracked: variant.inventory_tracked, inventoryPolicy: variant.inventory_policy, inventoryQuantity: variant.inventory_quantity }, 1)}
            className="mt-7 flex h-14 w-full items-center justify-center gap-2 bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {variant && isVariantAvailable({ productStatus: status, inventoryTracked: variant.inventory_tracked, inventoryPolicy: variant.inventory_policy, inventoryQuantity: variant.inventory_quantity }, 1) ? (
              <>
                Lägg till i varukorgen
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </>
            ) : (
              "Slut i lager"
            )}
          </button>

          <PaymentBadges />

          {content?.trustLines && (
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              {content.trustLines.map((line) => (
                <div key={line} className="flex items-center gap-2 text-xs leading-5 text-muted">
                  <TrustIcon text={line} />
                  {line}
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 border-t border-line">
            {descriptionHtml && (
              <AccordionRow heading={content?.descriptionHeading ?? "Beskrivning"} body={descriptionHtml} defaultOpen />
            )}
            {content?.accordionRows.map((row) => (
              <AccordionRow key={row.heading} heading={row.heading} body={row.body} />
            ))}
          </div>
        </div>
      </div>

      {reviews.length > 0 && (
        <div id="recensioner" className="mt-16 border-t border-line pt-16">
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
                {r.merchant_reply_body && (
                  <div className="mt-4 border-l-2 border-line pl-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">Svar från Jawhara</div>
                    <p className="mt-2 text-sm leading-6">{r.merchant_reply_body}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {content?.uspBlock && (
        <div className="mt-16 border-t border-line pt-14">
          <div className="grid grid-cols-2 gap-10 text-center lg:grid-cols-4">
            {content.uspBlock.map((item) => (
              <div key={item.heading}>
                <div className="text-sm font-semibold">{item.heading}</div>
                <p className="mt-2 text-xs leading-6 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suspense boundaries so these slower, separate async recommendation queries never hold up
          the main product content (title/price/gallery/buy button/description/reviews) from
          streaming to the browser first -- they pop in afterward instead of blocking the response. */}
      <Suspense fallback={null}>{complementaryProducts}</Suspense>

      <Suspense fallback={null}>{relatedProducts}</Suspense>

      {content?.faq && (
        <div className="mt-16 border-t border-line pt-14">
          <h2 className="text-[26px]">Vanliga frågor</h2>
          <div className="mt-6 max-w-[760px]">
            {content.faq.map((item, i) => (
              <AccordionRow key={item.question} heading={item.question} body={`<p>${item.answer}</p>`} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
