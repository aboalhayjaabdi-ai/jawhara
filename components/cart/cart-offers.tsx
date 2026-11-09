"use client";

import Link from "next/link";
import type { CheckoutTotals, PromoProgress } from "@/lib/discounts";

const JEWELRY_HREF = "/collections/alla-smycken";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

/** "same"-shaped promotion = jewelry "3 för 2"; "split" = buy-a-bag-get-a-wallet. */
export function findPromos(totals: CheckoutTotals | null): { jewelry: PromoProgress | null; wallet: PromoProgress | null } {
  const list = totals?.promoProgress ?? [];
  return { jewelry: list.find((p) => p.shape === "same") ?? null, wallet: list.find((p) => p.shape === "split") ?? null };
}

/** How many free wallets the cart's bags earn, and how many are already chosen (made free). */
export function walletStatus(wallet: PromoProgress | null) {
  if (!wallet || wallet.buyUnits === 0) return null;
  const entitled = wallet.applications * wallet.getQuantity;
  return { entitled, chosen: Math.min(wallet.freeUnits, entitled), needsChoice: wallet.freeUnits < entitled };
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-[3px] w-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full bg-fg transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

const BOX = "border border-line bg-[#f7f7f7] px-4 py-3.5";
const LINK_BUTTON = "btn-fx mt-3 inline-flex h-9 items-center border border-fg bg-bg px-4 text-[10px] font-semibold uppercase tracking-[0.16em]";

export function CartOffers({ totals, onNavigate }: { totals: CheckoutTotals | null; onNavigate: () => void }) {
  // Only the jewelry progress lives here -- the free-wallet choice is handled entirely by the
  // recommendations carousel below (one place to pick it, not two), and a chosen wallet is
  // confirmed on its own cart row ("Gratis (Valfri Plånbok)").
  const { jewelry } = findPromos(totals);

  const groupSize = jewelry ? jewelry.buyQuantity + jewelry.getQuantity : 0;
  const jewelryActive = !!jewelry && jewelry.freeUnits > 0;
  const showJewelry = !!jewelry && jewelry.buyUnits > 0 && (jewelryActive || jewelry.buyUnits < groupSize);

  if (!showJewelry || !jewelry) return null;

  return (
    <div className={BOX}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{jewelry.title}</span>
        <span className="text-[11px] text-muted">
          {jewelryActive ? groupSize : jewelry.buyUnits}/{groupSize}
        </span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={jewelryActive ? groupSize : jewelry.buyUnits} max={groupSize} />
      </div>
      {jewelryActive ? (
        <p className="mt-2.5 text-[13px] leading-5">
          Din {jewelry.title}-rabatt är aktiverad!{" "}
          <span className="text-muted">Du sparar {formatSek(jewelry.amountOff)}.</span>
        </p>
      ) : (
        <>
          <p className="mt-2.5 text-[13px] leading-5">
            {groupSize - jewelry.buyUnits === 1
              ? "Bara 1 smycke kvar tills du får det billigaste på köpet!"
              : `Lägg till ${groupSize - jewelry.buyUnits} smycken till och få det billigaste på köpet!`}
          </p>
          <Link href={JEWELRY_HREF} onClick={onNavigate} className={LINK_BUTTON}>
            Välj fler smycken →
          </Link>
        </>
      )}
    </div>
  );
}
