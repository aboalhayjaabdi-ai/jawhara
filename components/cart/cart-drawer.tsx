"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart, useCartTotals } from "./cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { SHIPPING_METHOD_NAME } from "@/lib/shipping-method";
import type { GiftBoxOffer } from "@/lib/gift-box";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

export function CartDrawer({ giftBoxOffer }: { giftBoxOffer: GiftBoxOffer | null }) {
  const { items, isOpen, close, addItem, removeItem, setQty, discountCode, setDiscountCode } = useCart();
  const { totals, loading, fetchError } = useCartTotals();
  const router = useRouter();

  const [codeInput, setCodeInput] = useState("");
  const [codeMessage, setCodeMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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

  // Applies a code by handing it to the shared, authoritative totals fetch (setDiscountCode
  // triggers useCartTotals to re-fetch) -- this function never decides acceptance/amount itself,
  // it only reads back what the server already computed and reflects that in the UI.
  async function applyCode() {
    const code = codeInput.trim();
    if (!code) return;
    setCodeMessage(null);
    try {
      const res = await fetch("/api/cart/totals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: items.map((i) => ({ variantId: i.variantId, qty: i.qty })), discountCode: code }),
      });
      const data = await res.json();
      const codeError = (data.errors as string[] | undefined)?.find((e) => e.toLowerCase().includes("rabattkod"));
      if (codeError) {
        setCodeMessage({ kind: "error", text: codeError });
        return;
      }
      const applied = (data.appliedDiscounts as { discountId: string; amountOff: number }[] | undefined)?.find(
        (d) => d.discountId === data.codeDiscountId
      );
      setDiscountCode(code);
      setCodeInput("");
      setCodeMessage({
        kind: "ok",
        text: applied ? `Rabattkod tillagd: -${formatSek(applied.amountOff)}` : "Rabattkod tillagd, men gav ingen rabatt på denna varukorg.",
      });
    } catch {
      setCodeMessage({ kind: "error", text: "Kunde inte kontrollera rabattkoden. Försök igen." });
    }
  }

  function removeCode() {
    setDiscountCode(null);
    setCodeMessage(null);
  }

  const codeAppliedLine = totals?.appliedDiscounts.find((d) => d.discountId === totals.codeDiscountId);
  const automaticDiscounts = totals?.appliedDiscounts.filter((d) => d.discountId !== totals?.codeDiscountId) ?? [];
  const blockingErrors = totals?.errors.filter((e) => !e.toLowerCase().includes("rabattkod")) ?? [];

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

          {blockingErrors.length > 0 && (
            <div className="border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              {blockingErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {totals && totals.discountNotices.length > 0 && (
            <div className="border border-line bg-[#f4f4f4] px-3 py-2.5 text-xs text-muted">
              {totals.discountNotices.map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          )}
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

          {items.length > 0 && (
            <div className="mb-4">
              {discountCode ? (
                <div className="flex items-center justify-between border border-line px-3 py-2.5 text-sm">
                  <span>
                    Rabattkod: <strong>{discountCode}</strong>
                  </span>
                  <button onClick={removeCode} className="text-xs text-muted underline">
                    Ta bort
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyCode();
                      }
                    }}
                    placeholder="Rabattkod"
                    className="h-11 flex-1 border border-line px-3 text-sm uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
                  />
                  <button
                    onClick={applyCode}
                    disabled={!codeInput.trim()}
                    className="h-11 border border-fg px-4 text-xs font-semibold uppercase tracking-widest disabled:opacity-40"
                  >
                    Använd
                  </button>
                </div>
              )}
              {codeMessage && (
                <p className={`mt-1.5 text-xs ${codeMessage.kind === "error" ? "text-red-700" : "text-muted"}`}>{codeMessage.text}</p>
              )}
            </div>
          )}

          {totals && items.length > 0 && (
            <div className="mb-4 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Delsumma</span>
                <span>{formatSek(totals.subtotal)}</span>
              </div>
              {automaticDiscounts.map((d) => (
                <div key={d.discountId} className="flex items-center justify-between text-muted">
                  <span>{d.title}</span>
                  <span>−{formatSek(d.amountOff)}</span>
                </div>
              ))}
              {codeAppliedLine && (
                <div className="flex items-center justify-between text-muted">
                  <span>Rabattkod ({discountCode})</span>
                  <span>−{formatSek(codeAppliedLine.amountOff)}</span>
                </div>
              )}
              {totals.discountTotal > 0 && (
                <div className="flex items-center justify-between font-medium">
                  <span>Total rabatt</span>
                  <span>−{formatSek(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-muted">
                <span>Frakt ({SHIPPING_METHOD_NAME})</span>
                <span>{totals.shipping > 0 ? formatSek(totals.shipping) : "Gratis"}</span>
              </div>
              {totals.vat > 0 && (
                <div className="flex items-center justify-between text-muted">
                  <span>Moms</span>
                  <span>{formatSek(totals.vat)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-line pt-2 text-base font-semibold">
                <span>Totalt</span>
                <span>{formatSek(totals.total)}</span>
              </div>
            </div>
          )}

          {!totals && items.length > 0 && (
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-muted">{loading ? "Beräknar..." : fetchError ? fetchError : "Delsumma"}</span>
            </div>
          )}

          <button
            disabled={items.length === 0 || !CHECKOUT_ENABLED || loading || blockingErrors.length > 0}
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
