"use client";

import Link from "next/link";
import type { CheckoutTotals, PromoProgress } from "@/lib/discounts";

const JEWELRY_HREF = "/collections/alla-smycken";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

/** "same"-shaped promotion = jewelry "3 för 2"; "split" = buy-a-bag-get-a-free-piece-of-jewelry
 * ("Valfritt Smycke"). */
export function findPromos(totals: CheckoutTotals | null): { jewelry: PromoProgress | null; gift: PromoProgress | null } {
  const list = totals?.promoProgress ?? [];
  return { jewelry: list.find((p) => p.shape === "same") ?? null, gift: list.find((p) => p.shape === "split") ?? null };
}

/** How many free gifts (jewelry) the cart's bags earn, and how many are already chosen (made free). */
export function giftStatus(gift: PromoProgress | null) {
  if (!gift || gift.buyUnits === 0) return null;
  const entitled = gift.applications * gift.getQuantity;
  return { entitled, chosen: Math.min(gift.freeUnits, entitled), needsChoice: gift.freeUnits < entitled };
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-[3px] w-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full bg-fg transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

// A compact strip pinned at the top of the cart (under the header), separated by a thin divider.
const STRIP = "cart-fade-in mx-auto w-full max-w-xl flex-shrink-0 border-b border-line px-6 py-3";
const LINK_BUTTON = "btn-fx inline-flex h-8 flex-shrink-0 items-center border border-fg bg-bg px-3 text-[10px] font-semibold uppercase tracking-[0.14em]";

export function CartOffers({ totals, onNavigate }: { totals: CheckoutTotals | null; onNavigate: () => void }) {
  // Only the "3 för 2" progress lives here -- the free-gift choice is handled entirely by the
  // recommendations carousel below (one place to pick it, not two), and a chosen gift is
  // confirmed on its own cart row ("Gratis (Valfritt Smycke)").
  const { jewelry } = findPromos(totals);

  const groupSize = jewelry ? jewelry.buyQuantity + jewelry.getQuantity : 0;
  const jewelryActive = !!jewelry && jewelry.freeUnits > 0;
  const showJewelry = !!jewelry && jewelry.buyUnits > 0 && (jewelryActive || jewelry.buyUnits < groupSize);

  if (!showJewelry || !jewelry) return null;

  return (
    <div className={STRIP}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{jewelry.title}</span>
        <span className="text-[11px] text-muted">
          {jewelryActive ? groupSize : jewelry.buyUnits}/{groupSize}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={jewelryActive ? groupSize : jewelry.buyUnits} max={groupSize} />
      </div>
      {jewelryActive ? (
        <p className="mt-2 text-xs leading-5">
          Din {jewelry.title}-rabatt är aktiverad!{" "}
          <span className="text-muted">Du sparar {formatSek(jewelry.amountOff)}.</span>
        </p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs leading-5">
            {groupSize - jewelry.buyUnits === 1
              ? "Bara 1 smycke kvar tills du får det billigaste på köpet!"
              : `Lägg till ${groupSize - jewelry.buyUnits} smycken till och få det billigaste på köpet!`}
          </p>
          <Link href={JEWELRY_HREF} onClick={onNavigate} className={LINK_BUTTON}>
            Välj fler smycken →
          </Link>
        </div>
      )}
    </div>
  );
}
