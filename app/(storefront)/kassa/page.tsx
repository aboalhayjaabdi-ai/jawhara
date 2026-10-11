"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCart } from "@/components/cart/cart-provider";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export default function KassaPage() {
  const { items, hydrated } = useCart();

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? (Array.isArray(data.errors) ? data.errors.join(", ") : "Något gick fel."));
    }
    return data.clientSecret as string;
  }, [items]);

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

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
