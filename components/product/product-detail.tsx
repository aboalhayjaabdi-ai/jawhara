"use client";

import Image from "next/image";
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

function decodeEntities(s: string): string {
  return s
    .replace(/&times;|&#215;/gi, "×")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

type SpecRow = { label: string; value: string; subRows?: { label: string; value: string }[] };

// Real product descriptions are plain, inconsistently-shaped HTML authored per category --
// rings/earrings are pure prose with no labels at all, while necklaces/bags/wallets/gift sets use
// "Label: value" lines (sometimes a compound "Mått: Bredd: X × Höjd: Y × Djup: Z"). This extracts
// whatever label/value structure is actually present and leaves everything else as plain text, so
// every one of the ~380 existing products renders safely without any content rewrite.
function parseSpecContent(html: string): { rows: SpecRow[]; freeText: string[] } {
  const paragraphs = html.split(/<\/p>/i).map((p) => p.replace(/<p[^>]*>/i, ""));
  const lines: string[] = [];
  for (const p of paragraphs) {
    for (const part of p.split(/<br\s*\/?>/i)) {
      const text = decodeEntities(part.replace(/<[^>]+>/g, "")).trim();
      if (text) lines.push(text);
    }
  }
  const labelRe = /^([A-ZÅÄÖ][a-zA-ZåäöÅÄÖ]*):\s*(.+)$/;
  const rows: SpecRow[] = [];
  const freeText: string[] = [];
  for (const line of lines) {
    const m = line.match(labelRe);
    if (!m) {
      freeText.push(line);
      continue;
    }
    const [, label, rest] = m;
    // Real "Mått:" values come in two shapes: "Bredd: 25 cm × Längd: 13 cm" (colon sub-labels) and
    // "Längd 22 cm, Bredd 12 cm, Djup 9 cm" (space-separated, comma-joined). Split on "×" (always
    // safe) or a comma followed by a capitalized word (a new sub-label, never a Swedish decimal
    // comma like "22,5 cm", which is followed by a digit).
    const subParts = rest.split(/×|,\s*(?=[A-ZÅÄÖ])/).map((s) => s.trim()).filter(Boolean);
    const subLabelRe = /^([A-ZÅÄÖ][a-zA-ZåäöÅÄÖ]*)[:\s]+(\d.*)$/;
    // A handful of real listings (e.g. bundles with two sizes) leave a second, unlabeled number
    // trailing a sub-value, like "Höjd 20 cm, 14 cm" -- the comma there isn't followed by a
    // capital letter so it survives the split above as part of the "Höjd" value. Detect that
    // (a stray ", <digit>" inside a captured sub-value) and bail out of structuring the whole row
    // rather than showing a misleading two-numbers-in-one-cell table.
    const hasStrayNumber = (value: string) => /,\s*\d/.test(value);
    const parsedSubRows =
      subParts.length > 1 && subParts.every((sp) => subLabelRe.test(sp))
        ? subParts.map((sp) => {
            const sm = sp.match(subLabelRe)!;
            return { label: sm[1], value: sm[2].trim() };
          })
        : null;
    if (parsedSubRows && !parsedSubRows.some((sr) => hasStrayNumber(sr.value))) {
      rows.push({ label, value: rest, subRows: parsedSubRows });
    } else {
      rows.push({ label, value: rest });
    }
  }
  return { rows, freeText };
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
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;
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

// Small, recognizable payment-method badges in each brand's own color, matching the reference
// layout's real icon row rather than a flat monochrome text-pill list.
function PaymentBadges() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <span className="flex h-6 items-center rounded-[3px] bg-[#FFB3C7] px-2 text-[11px] font-bold text-black">Klarna</span>
      <span className="flex h-6 items-center rounded-[3px] bg-[#1A1F71] px-2 text-[11px] font-bold italic text-white">VISA</span>
      <span className="relative flex h-6 w-10 items-center justify-center rounded-[3px] border border-line bg-white">
        <span className="absolute left-[9px] h-3.5 w-3.5 rounded-full bg-[#EB001B]" />
        <span className="absolute left-[15px] h-3.5 w-3.5 rounded-full bg-[#F79E1B] mix-blend-multiply" />
      </span>
      <span className="flex h-6 items-center gap-1 rounded-[3px] bg-black px-2 text-[11px] font-semibold text-white">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.84M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.05 3.19-.7.85-1.87 1.51-3.02 1.42-.15-1.15.41-2.35 1.13-3.11z" />
        </svg>
        Pay
      </span>
      <span className="flex h-6 items-center gap-1 rounded-[3px] border border-line bg-white px-2 text-[11px] font-semibold text-[#3c4043]">
        <span
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
          style={{ background: "conic-gradient(#4285F4 0deg 90deg, #34A853 90deg 180deg, #FBBC05 180deg 270deg, #EA4335 270deg 360deg)" }}
        >
          <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-white text-[8px] font-bold text-[#4285F4]">G</span>
        </span>
        Pay
      </span>
    </div>
  );
}

function AccordionRow({
  heading,
  body,
  children,
  defaultOpen = false,
  index,
}: {
  heading: string;
  body?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** When set, renders a "01 "-style number prefix before the heading, matching the reference's
   * numbered section headers. Omitted for FAQ rows, which aren't numbered there. */
  index?: number;
}) {
  return (
    <details className="group border-b border-line py-5" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium uppercase tracking-[0.14em]">
        <span>
          {index != null && <span className="mr-3 text-[11px] tracking-normal text-muted">{String(index).padStart(2, "0")}</span>}
          {heading}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="shrink-0 transition-transform group-open:rotate-180" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-4 border-t-2 border-fg pt-4 text-[13px] leading-7 text-muted [&_p]:mb-2">
        {children ?? (body != null && <div dangerouslySetInnerHTML={{ __html: body }} />)}
      </div>
    </details>
  );
}

function SpecTable({ html }: { html: string }) {
  const { rows, freeText } = useMemo(() => parseSpecContent(html), [html]);
  return (
    <>
      {freeText.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      {rows.length > 0 && (
        <div className="divide-y divide-line">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="py-5 first:pt-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 whitespace-nowrap text-[11px] tracking-[0.14em] text-muted uppercase">{r.label}</span>
                {!r.subRows && <span className="overflow-x-auto whitespace-nowrap text-right text-[15px]">{r.value}</span>}
              </div>
              {r.subRows && (
                <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-3">
                  {r.subRows.map((sr, j) => (
                    <div key={`${sr.label}-${j}`} className="min-w-0">
                      <div className="whitespace-nowrap text-[10.5px] tracking-[0.12em] text-muted uppercase">{sr.label}</div>
                      <div className="mt-1 overflow-x-auto whitespace-nowrap text-[15px] text-fg">{sr.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
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
            <div className="relative mt-6 border border-line p-1">
              <div className="relative border border-line/60 bg-[#f7f7f7] p-5">
                {content.offerMessage.image && (
                  <div className="absolute right-5 top-5 h-16 w-16 overflow-hidden bg-bg sm:h-20 sm:w-20">
                    <Image src={content.offerMessage.image} alt="" fill className="object-contain p-1.5" sizes="80px" />
                  </div>
                )}
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <rect x="3" y="8" width="18" height="4" rx="1" />
                    <path d="M12 8v13" />
                    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
                  </svg>
                  Erbjudande
                </div>
                <div className="mt-3 max-w-[85%] text-xl font-medium uppercase leading-tight tracking-[0.04em] sm:text-2xl">
                  {content.offerMessage.heading}
                </div>
                <p className="mt-4 max-w-[85%] text-sm leading-7 text-muted">{content.offerMessage.body}</p>
                {walletPromoEligible && content.offerMessage.href && (
                  <Link
                    href={content.offerMessage.href}
                    className="mt-5 flex h-12 w-full max-w-xs items-center justify-center gap-2 border border-fg text-xs font-semibold uppercase tracking-[0.18em]"
                  >
                    Välj din plånbok
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                )}
              </div>
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
            <div className="mt-5 grid grid-cols-2 border border-line">
              {content.trustLines.map((line, i) => (
                <div
                  key={line}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3.5 text-center ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line" : ""}`}
                >
                  <TrustIcon text={line} />
                  <span className="text-[10.5px] leading-4 text-muted">{line}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 border-t border-line">
            {descriptionHtml && (
              <AccordionRow heading={content?.descriptionHeading ?? "Beskrivning"} defaultOpen index={1}>
                <SpecTable html={descriptionHtml} />
              </AccordionRow>
            )}
            {content?.accordionRows.map((row, i) => (
              <AccordionRow key={row.heading} heading={row.heading} body={row.body} index={i + 2} />
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
