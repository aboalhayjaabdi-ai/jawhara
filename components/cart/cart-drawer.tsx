"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

export function CartDrawer() {
  const { items, isOpen, close, removeItem, setQty, subtotal } = useCart();
  const router = useRouter();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={close}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[420px] bg-bg transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-6">
          <h2 className="font-serif text-lg">Din varukorg</h2>
          <button onClick={close} aria-label="Stäng" className="text-sm uppercase tracking-wide">
            Stäng
          </button>
        </div>

        <div className="flex h-[calc(100%-4rem-7rem)] flex-col gap-6 overflow-y-auto px-6 py-6">
          {items.length === 0 && <p className="text-sm text-muted">Din varukorg är tom.</p>}
          {items.map((item) => (
            <div key={item.variantId} className="flex gap-4 border-b border-line pb-6">
              <div className="relative h-24 w-20 flex-shrink-0 bg-[#f4f4f4]">
                {item.image && <Image src={item.image} alt={item.title} fill sizes="80px" className="object-cover" />}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs uppercase tracking-wide text-muted">{item.variantTitle}</div>
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
                  <span className="text-sm font-semibold">{formatSek(item.price * item.qty)}</span>
                </div>
              </div>
              <button onClick={() => removeItem(item.variantId)} className="self-start text-xs text-muted underline">
                Ta bort
              </button>
            </div>
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-line bg-bg px-6 py-5">
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
      </aside>
    </>
  );
}
