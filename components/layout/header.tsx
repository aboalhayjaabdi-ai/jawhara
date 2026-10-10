"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";

// Real main-menu items, from data/exports/menus.jsonl (handle: main-menu).
const NAV_ITEMS = [
  { title: "Alla smycken", href: "/collections/alla-smycken" },
  { title: "Armband", href: "/collections/armband" },
  { title: "Halsband", href: "/collections/halsband" },
  { title: "Ringar", href: "/collections/ringar" },
  { title: "Örhängen", href: "/collections/orhangen" },
  { title: "Väskor", href: "/collections/vaskor-och-tillbehor" },
  { title: "Tillbehör", href: "/collections/tillbehor" },
];

export function Header() {
  const { count, open } = useCart();

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center border-b border-line bg-bg">
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-6 lg:px-14">
        <nav className="hidden items-center gap-5 text-[11px] font-semibold uppercase tracking-wide xl:flex">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap">
              {item.title}
            </Link>
          ))}
        </nav>

        <Link href="/" className="col-start-2 justify-self-center">
          <Image src="/brand/logo.png" alt="Jawhara" width={140} height={35} className="h-[35px] w-auto" priority />
        </Link>

        <div className="col-start-3 flex items-center justify-end gap-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
          <button onClick={open} aria-label="Öppna varukorg" className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-fg text-[9px] font-bold text-bg">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
