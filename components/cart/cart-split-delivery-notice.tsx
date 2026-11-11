"use client";

/**
 * "Two separate parcels" notice in the cart drawer, just above the totals. Shown only when the
 * cart holds at least one longer-delivery bag AND at least one other product (see
 * ./use-long-delivery.ts for the grouping). Purely informational -- no effect on prices,
 * shipping or checkout.
 */

const TEXT = "Din beställning skickas i 2 separata paket eftersom vissa produkter har längre leveranstid.";

export function CartSplitDeliveryNotice({
  productIds,
  isLongDelivery,
}: {
  productIds: string[];
  isLongDelivery: (productId: string) => boolean | undefined;
}) {
  const ids = Array.from(new Set(productIds));
  // Decide only once every product's group is known, so the notice never flashes on/off.
  if (ids.length < 2 || ids.some((id) => isLongDelivery(id) === undefined)) return null;
  const hasLong = ids.some((id) => isLongDelivery(id));
  const hasRegular = ids.some((id) => !isLongDelivery(id));
  if (!hasLong || !hasRegular) return null;

  return (
    <div className="mb-3 flex items-start gap-2.5 border border-line bg-[#f7f7f7] px-3 py-2.5">
      <DeliveryTruckIcon size={16} className="mt-px shrink-0" />
      <p className="text-xs leading-[18px]">{TEXT}</p>
    </div>
  );
}

/** Small delivery-time box under a cart line's product name (longer-delivery bags only). Shorter
 * wording than the product page so it stays on one line in the narrow cart column. */
export const CART_LINE_DELIVERY_TEXT = "Leveranstid: 3–5 veckor";

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
