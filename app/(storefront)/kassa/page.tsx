"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { trackInitiateCheckout } from "@/lib/marketing/events";

// This route is no longer part of the customer journey -- nothing in the app links or navigates
// here anymore (the cart drawer's "Till kassan" redirects straight to Shopify's hosted checkout
// from wherever the customer already is; see goToCheckout in components/cart/cart-provider.tsx).
// It only still exists so an old bookmark or a link already sent out doesn't 404: it silently
// runs the identical sync-then-redirect and bounces onward -- to Shopify's checkout on success,
// back to the homepage on any failure (the exact same price-parity guard goToCheckout always
// applies, see its own comment) -- with no order summary, shipping section, or payment UI of its
// own rendered in between.
export default function KassaPage() {
  const { items, hydrated, subtotal, goToCheckout } = useCart();
  const router = useRouter();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!hydrated || attempted) return;
    setAttempted(true);

    if (items.length === 0) {
      router.replace("/");
      return;
    }

    (async () => {
      const result = await goToCheckout();
      if (!result.ok) {
        // Nothing to show an error on here (there is no cart UI on this route) -- the cart
        // drawer's own error state (shopifyWarnings/checkoutError) is unaffected and still
        // reflects whatever went wrong the next time it's opened.
        router.replace("/");
        return;
      }
      trackInitiateCheckout({
        value: subtotal,
        currency: "SEK",
        itemCount: items.reduce((sum, i) => sum + i.qty, 0),
        // Same guard as the cart drawer's own InitiateCheckout call -- see its comment.
        contents: items.filter((i) => i.productId).map((i) => ({ id: i.productId, quantity: i.qty })),
      });
      // On success goToCheckout already navigated the browser away (window.location.href) --
      // nothing left to render.
    })();
  }, [hydrated, attempted, items, subtotal, goToCheckout, router]);

  return <div className="mx-auto max-w-2xl px-6 py-24" />;
}
