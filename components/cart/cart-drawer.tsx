"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import type { GiftBoxOffer } from "@/lib/gift-box";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

export function CartDrawer({ giftBoxOffer }: { giftBoxOffer: GiftBoxOffer | null }) {
  const { items, isOpen, close, addItem, removeItem, setQty, subtotal } = useCart();
  const router = useRouter();

  // Presence-guarded toggle, not a bare addItem/removeItem pair -- addItem is additive (stacks
  // qty on repeat calls for the same variant), so checking presence first prevents a double-add
  // if this handler ever fires more than once for the same check.
  const giftBoxInCart = giftBoxOffer ? items.some((i) => i.variantId === giftBoxOffer.variantId) : false;
  function toggleGiftBox(checked: boolean) {
    if (!giftBoxOffer) return;
    if (checked) {
      if (!items.some((i) => i.variantId === giftBoxOffer.variantId)) {
        addItem(
          {
            variantId: giftBoxOffer.variantId,
            productHandle: giftBoxOffer.productHandle,
            title: giftBoxOffer.title,
            variantTitle: "",
            price: giftBoxOffer.price,
            compareAtPrice: null,
            image: giftBoxOffer.image,
          },
          1
        );
      }
    } else {
      removeItem(giftBoxOffer.variantId);
    }
  }

  return (
    <>
      {/* Desktop-only dimmed backdrop -- mobile stays the untouched full-screen takeover with
          nothing behind it to dim. */}
      <div
        onClick={close}
        aria-hidden
        className={`fixed inset-0 z-40 hidden bg-black/40 transition-opacity duration-300 lg:block ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-0 z-50 flex flex-col bg-bg transition-transform duration-300 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[420px] lg:shadow-2xl ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
      <div className="mx-auto flex h-16 w-full max-w-xl flex-shrink-0 items-center justify-between px-6">
        <h2 className="font-serif text-lg">Din varukorg</h2>
        <button onClick={close} aria-label="Stäng" className="text-sm uppercase tracking-wide">
          Stäng
        </button>
      </div>
      <div className="mx-auto h-px w-full max-w-xl border-t border-line" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-6">
          {items.length === 0 && <p className="text-sm text-muted">Din varukorg är tom.</p>}
          {items.map((item) => {
            const variantTitle = normalizeVariantTitle(item.variantTitle);
            const onSale = item.compareAtPrice != null && item.compareAtPrice > item.price;
            return (
              <div key={item.variantId} className="flex gap-4 border-b border-line pb-6">
                <Link
                  href={`/products/${item.productHandle}`}
                  onClick={close}
                  className="relative aspect-square h-24 w-24 flex-shrink-0 bg-[#f4f4f4]"
                >
                  {item.image && <Image src={item.image} alt={item.title} fill sizes="96px" className="object-contain" />}
                </Link>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link href={`/products/${item.productHandle}`} onClick={close} className="text-sm font-medium">
                      {item.title}
                    </Link>
                    {variantTitle && <div className="text-xs uppercase tracking-wide text-muted">{variantTitle}</div>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 border border-line">
                      <button className="px-2 py-1 text-xs" onClick={() => setQty(item.variantId, item.qty - 1)}>
                        −
                      </button>
                      <span className="text-xs">{item.qty}</span>
                      <button className="px-2 py-1 text-xs" onClick={() => setQty(item.variantId, item.qty + 1)}>
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-2">
                        <span className="text-sm font-semibold">{formatSek(item.price * item.qty)}</span>
                        {onSale && (
                          <span className="text-xs text-muted line-through">{formatSek(item.compareAtPrice! * item.qty)}</span>
                        )}
                      </div>
                      {onSale && (
                        <div className="text-xs text-muted">Du sparar {formatSek((item.compareAtPrice! - item.price) * item.qty)}</div>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeItem(item.variantId)} className="self-start text-xs text-muted underline">
                  Ta bort
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-line bg-bg">
        <div className="mx-auto max-w-xl px-6 py-5">
          {giftBoxOffer && items.length > 0 && (
            <label className="mb-4 flex items-center gap-3 border border-line px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={giftBoxInCart}
                onChange={(e) => toggleGiftBox(e.target.checked)}
                className="h-4 w-4 flex-shrink-0"
              />
              <span>
                Lägg till en presentask för {formatSek(giftBoxOffer.price)}
              </span>
            </label>
          )}
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-muted">Delsumma</span>
            <span className="font-semibold">{formatSek(subtotal)}</span>
          </div>
          <button
            disabled={items.length === 0 || !CHECKOUT_ENABLED}
            onClick={() => {
              close();
              router.push("/kassa");
            }}
            className="flex h-14 w-full items-center justify-center bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {CHECKOUT_ENABLED ? "Till kassan" : "Kassan öppnar snart"}
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
