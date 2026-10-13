"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart, useCartTotals } from "./cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { buildDisplayLines, buildCartSummary } from "@/lib/cart-display";
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

  const blockingErrors = totals?.errors.filter((e) => !e.toLowerCase().includes("rabattkod")) ?? [];
  const displayLines = buildDisplayLines(items, totals);
  const summary = buildCartSummary(items, totals);

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
          {displayLines.map((line) => {
            const variantTitle = normalizeVariantTitle(line.variantTitle);
            const onSale = line.compareAtPrice != null && line.compareAtPrice > line.unitPrice;
            // There is exactly one real CartItem per variant -- splitting it into a paid row and a
            // free row is purely a display transform (lib/cart-display.ts). Every row still gets
            // its own fully working +/-/remove controls, all reading and writing that same one
            // underlying quantity, so the split can never create a second physical line item:
            // - "+"/"-" on EITHER row adjust the variant's total quantity by 1 (there's only one
            //   quantity to adjust); the paid/free split is then recomputed automatically from the
            //   new total on the next totals fetch.
            // - "Ta bort" on a given row removes exactly that row's own displayed quantity from the
            //   total -- removing the free row of a 2-paid+1-free split takes 3 -> 2 and drops the
            //   promotion, exactly matching removing the whole item when a row already represents
            //   the full quantity (qty <= 0 falls through to a real removeItem via setQty).
            const realQty = items.find((i) => i.variantId === line.variantId)?.qty ?? line.qty;
            return (
              <div key={line.key} className="flex gap-4 border-b border-line pb-6">
                <Link
                  href={`/products/${line.productHandle}`}
                  onClick={close}
                  className="relative aspect-square h-24 w-24 flex-shrink-0 bg-[#f4f4f4]"
                >
                  {line.image && <Image src={line.image} alt={line.title} fill sizes="96px" className="object-contain" />}
                </Link>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link href={`/products/${line.productHandle}`} onClick={close} className="text-sm font-medium">
                      {line.title}
                    </Link>
                    {variantTitle && <div className="text-xs uppercase tracking-wide text-muted">{variantTitle}</div>}
                    {line.isFree ? (
                      <div className="mt-1 inline-block bg-fg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bg">
                        Gratis{line.freeLabel ? ` (${line.freeLabel})` : ""}
                      </div>
                    ) : (
                      line.eligibleLabels.length > 0 && (
                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {line.eligibleLabels.join(", ")}
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 border border-line">
                      <button className="px-2 py-1 text-xs" onClick={() => setQty(line.variantId, realQty - 1)}>
                        −
                      </button>
                      <span className="text-xs">{line.qty}</span>
                      <button className="px-2 py-1 text-xs" onClick={() => setQty(line.variantId, realQty + 1)}>
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-2">
                        <span className="text-sm font-semibold">{formatSek(line.lineTotal)}</span>
                        {onSale && (
                          <span className="text-xs text-muted line-through">{formatSek(line.compareAtPrice! * line.qty)}</span>
                        )}
                      </div>
                      {onSale && !line.isFree && (
                        <div className="text-xs text-muted">Du sparar {formatSek((line.compareAtPrice! - line.unitPrice) * line.qty)}</div>
                      )}
                      {line.isFree && line.savedAmount > 0 && (
                        <div className="text-xs text-muted">Du sparar {formatSek(line.savedAmount)}</div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setQty(line.variantId, realQty - line.qty)}
                  className="self-start text-xs text-muted underline"
                >
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

          {items.length > 0 && (
            <div className="mb-4">
              {summary ? (
                <>
                  <div className="flex items-center justify-between text-sm text-muted">
                    <span>Delsumma</span>
                    <span>{formatSek(summary.originalSubtotal)}</span>
                  </div>
                  {summary.totalSavings > 0 && (
                    <div className="flex items-center justify-between text-sm text-muted">
                      <span>Total rabatt</span>
                      <span>−{formatSek(summary.totalSavings)}</span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-2 text-base font-semibold">
                    <span>Total</span>
                    <span>{formatSek(summary.total)}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">Tullavgifter samt frakt och skatter ingår.</p>
                </>
              ) : (
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Totalt</span>
                  <span>{loading ? "Beräknar..." : fetchError ?? "—"}</span>
                </div>
              )}
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
