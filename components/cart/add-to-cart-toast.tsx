"use client";

import { useJustAdded } from "@/components/cart/cart-provider";

// Global, single-mount confirmation for every add-to-cart action (PDP, homepage quick-add, the
// variant picker, "Du kanske också gillar") -- they all share one CartContext, so this reacts to
// all of them without needing its own wiring in each component. Same visual language as the
// site's existing primary-CTA buttons (bg-fg/text-bg, uppercase, sharp corners), not a new style.
export function AddToCartToast() {
  const visible = useJustAdded(2200);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2.5 bg-fg px-5 py-3 text-xs font-semibold uppercase tracking-wide text-bg shadow-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M5 13l4 4L19 7" />
        </svg>
        Tillagd i varukorgen
      </div>
    </div>
  );
}
