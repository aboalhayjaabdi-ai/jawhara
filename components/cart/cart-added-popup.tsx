"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { normalizeVariantTitle } from "@/lib/variant-title";
import type { CartItem } from "./cart-provider";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

const DISMISS_DISTANCE = 70; // px dragged to the right that dismisses it
const DISMISS_VELOCITY = 0.5; // px/ms -- a quick flick dismisses even if short

/**
 * The cart's "✓ Tillagd i varukorgen!" popup. The outer element runs the slide-in / stay /
 * slide-out animation (globals.css .cart-confirm); the inner card follows the finger (or mouse)
 * so it can be swiped away to the right. A short drag springs back.
 */
export function CartAddedPopup({
  item,
  qty,
  onDismiss,
}: {
  item: Omit<CartItem, "qty">;
  qty: number;
  onDismiss: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; t: number; id: number } | null>(null);
  const variantTitle = normalizeVariantTitle(item.variantTitle);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (leaving) return;
    start.current = { x: e.clientX, t: performance.now(), id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    const raw = e.clientX - start.current.x;
    // Free to the right, heavy resistance to the left.
    setDx(raw >= 0 ? raw : raw / 4);
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    const distance = e.clientX - start.current.x;
    const velocity = distance / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    setDragging(false);
    if (distance > DISMISS_DISTANCE || (distance > 20 && velocity > DISMISS_VELOCITY)) {
      setLeaving(true);
      setDx(window.innerWidth);
      window.setTimeout(onDismiss, 200);
    } else {
      setDx(0);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="cart-confirm absolute right-4 top-[76px] z-20 w-max max-w-[calc(100%-2rem)]"
    >
      {/* Sized to its content (no empty space), capped to the cart's width. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          transform: `translateX(${dx}px)`,
          opacity: leaving ? 0 : 1 - Math.min(0.6, Math.max(0, dx) / 300),
          transition: dragging ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
        }}
        className="flex cursor-grab touch-pan-y select-none items-center gap-2.5 border border-line bg-bg py-2 pl-2 pr-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] active:cursor-grabbing"
      >
        <div className="pointer-events-none relative h-12 w-12 flex-shrink-0 bg-bg">
          {item.image && <Image src={item.image} alt="" fill sizes="48px" className="object-contain" draggable={false} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">✓ Tillagd i varukorgen!</div>
          <div className="mt-0.5 truncate text-xs">
            {item.title}
            {variantTitle ? ` · ${variantTitle}` : ""}
          </div>
          <div className="text-xs text-muted">
            {qty} st · {formatSek(item.price * qty)}
          </div>
        </div>
      </div>
    </div>
  );
}
