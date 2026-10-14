"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCart, useCartTotals } from "@/components/cart/cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { SHIPPING_METHOD_NAME } from "@/lib/shipping-method";
import { buildDisplayLines, buildCartSummary } from "@/lib/cart-display";
import { trackInitiateCheckout, trackAddPaymentInfo } from "@/lib/marketing/events";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export default function KassaPage() {
  const { items, hydrated, discountCode } = useCart();
  const { totals, loading } = useCartTotals();
  const trackedRef = useRef(false);
  const trackedPaymentInfoRef = useRef(false);

  useEffect(() => {
    if (!hydrated || items.length === 0 || trackedRef.current) return;
    trackedRef.current = true;
    const value = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
    trackInitiateCheckout({ value, currency: "SEK", itemCount, contentIds: items.map((i) => i.variantId) });
  }, [hydrated, items]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        discountCode,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? (Array.isArray(data.errors) ? data.errors.join(", ") : "Något gick fel."));
    }
    // The embedded payment form is about to render with a real Stripe Checkout Session now that
    // this succeeded -- the natural "customer reached the payment step" moment for this
    // embedded-iframe flow, which has no finer-grained field-level event to hook into.
    if (!trackedPaymentInfoRef.current) {
      trackedPaymentInfoRef.current = true;
      const value = items.reduce((sum, i) => sum + i.price * i.qty, 0);
      trackAddPaymentInfo({ value, currency: "SEK" });
    }
    return data.clientSecret as string;
  }, [items, discountCode]);

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

  if (!stripePromise) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-sm text-muted">Kassan är inte konfigurerad ännu.</p>
      </div>
    );
  }

  const displayLines = buildDisplayLines(items, totals);
  const summary = buildCartSummary(items, totals);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Always-visible order summary -- no dropdown/accordion. Every figure here comes from the
          same /api/cart/totals call (computeCheckoutTotals) that app/api/checkout/route.ts uses to
          build the real Stripe session below, so this can never disagree with what's charged. */}
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
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
