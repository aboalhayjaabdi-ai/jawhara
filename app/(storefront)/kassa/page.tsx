"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart, useCartTotals } from "@/components/cart/cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { SHIPPING_METHOD_NAME } from "@/lib/shipping-method";
import { buildDisplayLines, buildCartSummary } from "@/lib/cart-display";
import { trackInitiateCheckout } from "@/lib/marketing/events";

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

// Phase 3: checkout itself now happens on Shopify's own hosted page (see goToCheckout in
// components/cart/cart-provider.tsx) -- nothing in the app navigates to this route anymore (the
// cart drawer's "Till kassan" redirects straight to Shopify from wherever the customer already
// is). This page only still exists for a direct visit (an old bookmark, a shared link): it shows
// the exact same order summary it always has, with a single button that runs the identical
// sync-then-redirect the drawer's button does, instead of the old Stripe embedded payment form.
export default function KassaPage() {
  const { items, hydrated, subtotal, goToCheckout } = useCart();
  const { totals, loading } = useCartTotals();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    if (isCheckingOut) return;
    setCheckoutError(null);
    setIsCheckingOut(true);
    const result = await goToCheckout();
    if (!result.ok) {
      setCheckoutError(result.error);
      setIsCheckingOut(false);
      return;
    }
    trackInitiateCheckout({ value: subtotal, currency: "SEK", itemCount: items.reduce((sum, i) => sum + i.qty, 0) });
  }

  if (!hydrated) {
    return <div className="mx-auto max-w-2xl px-6 py-24" />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-sm text-muted">Din varukorg är tom.</p>
      </div>
    );
  }

  const displayLines = buildDisplayLines(items, totals);
  const summary = buildCartSummary(items, totals);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Always-visible order summary -- no dropdown/accordion. Every figure here is Jawhara's own
          price (computeCheckoutTotals via /api/cart/totals), including admin-managed discounts --
          Shopify's own checkout total below it can disagree with this until Phase 4 connects
          those discounts to Shopify too (see goToCheckout in cart-provider.tsx). */}
      <div className="mb-8 border border-line">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest">Ordersammanfattning</h2>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          {displayLines.map((line) => {
            const variantTitle = normalizeVariantTitle(line.variantTitle);
            const onSale = line.compareAtPrice != null && line.compareAtPrice > line.unitPrice;
            return (
              <div key={line.key} className="flex gap-3">
                <div className="relative aspect-square h-16 w-16 flex-shrink-0 bg-[#f4f4f4]">
                  {line.image && <Image src={line.image} alt={line.title} fill sizes="64px" className="object-contain" />}
                </div>
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{line.title}</div>
                    {variantTitle && <div className="text-xs uppercase tracking-wide text-muted">{variantTitle}</div>}
                    <div className="text-xs text-muted">Antal: {line.qty}</div>
                    {line.isFree && (
                      <div className="mt-1 block w-fit bg-fg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bg">
                        Gratis{line.freeLabel ? ` (${line.freeLabel})` : ""}
                      </div>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right">
                    <div className="text-sm font-semibold">{formatSek(line.lineTotal)}</div>
                    {onSale && (
                      <div className="text-xs text-muted line-through">{formatSek(line.compareAtPrice! * line.qty)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line px-5 py-4 text-sm">
          {summary ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted">Delsumma</span>
                <span>{formatSek(summary.originalSubtotal)}</span>
              </div>
              {summary.totalSavings > 0 && (
                <div className="flex items-center justify-between font-medium">
                  <span>Total rabatt</span>
                  <span>−{formatSek(summary.totalSavings)}</span>
                </div>
              )}
              {totals && totals.vat > 0 && (
                <div className="flex items-center justify-between text-muted">
                  <span>Moms</span>
                  <span>{formatSek(totals.vat)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-line pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatSek(summary.total)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">Tullavgifter samt frakt och skatter ingår.</p>
            </>
          ) : (
            <div className="text-muted">{loading ? "Beräknar..." : ""}</div>
          )}
        </div>
      </div>

      <div className="mb-8 border border-line">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest">Frakt</h2>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden border border-line">
              <Image src="/brand/postnord-logo.png" alt="PostNord" fill sizes="40px" className="object-cover" />
            </div>
            <span className="text-sm font-medium">{SHIPPING_METHOD_NAME}</span>
          </div>
          <span className="text-sm font-semibold">Gratis</span>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest">Kassa</h2>
        {checkoutError && <p className="mb-2 text-xs text-red-700">{checkoutError}</p>}
        <button
          disabled={!CHECKOUT_ENABLED || loading || isCheckingOut}
          onClick={handleCheckout}
          className="flex h-14 w-full items-center justify-center bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
        >
          {!CHECKOUT_ENABLED ? "Kassan öppnar snart" : isCheckingOut ? "Öppnar kassan..." : "Till kassan"}
        </button>
      </div>
    </div>
  );
}
