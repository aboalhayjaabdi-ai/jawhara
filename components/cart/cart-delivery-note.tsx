"use client";

/** Small delivery-time box under a cart line's product name (longer-delivery bags only). Shorter
 * wording than the product page so it stays on one line in the narrow cart column. */
export const CART_LINE_DELIVERY_TEXT = "Leveranstid: 3–4 veckor";

export function CartLineDeliveryNote() {
  return (
    <div className="mb-2 mt-1.5 flex w-fit items-center gap-1 border border-line bg-[#f7f7f7] px-1.5 py-0.5">
      <DeliveryTruckIcon size={12} className="shrink-0" />
      <span className="text-[10.5px] font-medium leading-4">{CART_LINE_DELIVERY_TEXT}</span>
    </div>
  );
}

function DeliveryTruckIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="19" r="1.6" />
      <circle cx="17.5" cy="19" r="1.6" />
    </svg>
  );
}
