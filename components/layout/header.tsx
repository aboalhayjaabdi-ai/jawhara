"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart, useJustAdded } from "@/components/cart/cart-provider";
import { PriorityNav } from "@/components/layout/priority-nav";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import type { NavLink } from "@/lib/queries";

// Fallback only (used if the real-time query below the layout ever returns nothing) -- the real
// main-menu content now lives in the `storefront_menus`/`storefront_menu_items` tables, editable
// via /admin/storefront/menus, originally seeded verbatim from this exact list (migration
// 0021_phase7_storefront_seed.sql).
const FALLBACK_NAV_ITEMS: NavLink[] = [
  { title: "Hem", href: "/" },
  { title: "Alla smycken", href: "/collections/alla-smycken" },
  { title: "Armband", href: "/collections/armband" },
  { title: "Halsband", href: "/collections/halsband" },
  { title: "Ringar", href: "/collections/ringar" },
  { title: "Örhängen", href: "/collections/orhangen" },
  { title: "Väskor", href: "/collections/vaskor-och-tillbehor" },
  { title: "Tillbehör", href: "/collections/tillbehor" },
];

export const HEADER_HEIGHT_PX = 68;

export function Header({ navItems, logoUrl, overlayOnHome = false }: { navItems?: NavLink[]; logoUrl?: string | null; overlayOnHome?: boolean }) {
  const { count, open } = useCart();
  const justAdded = useJustAdded(500);
  const NAV_ITEMS = navItems && navItems.length > 0 ? navItems : FALLBACK_NAV_ITEMS;

  // Homepage only, and only when its first section is a banner set to "overlayHeader": the header
  // starts transparent on top of the banner image (white logo/icons/links), then returns to its
  // normal white look as soon as the visitor scrolls. Every other page is unchanged.
  const pathname = usePathname();
  const overlay = overlayOnHome && pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);
  const transparent = overlay && !scrolled;

  return (
    <header
      className={`sticky top-0 z-30 flex h-[68px] items-center border-b motion-safe:transition-colors motion-safe:duration-300 ${
        transparent ? "border-transparent bg-transparent text-white" : "border-line bg-bg"
      }`}
    >
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-14">
        <div className="min-w-0">
          <div className="md:hidden">
            <MobileNavDrawer items={NAV_ITEMS} />
          </div>
          <div className="hidden md:block">
            <PriorityNav items={NAV_ITEMS} />
          </div>
        </div>

        <Link href="/" className="col-start-2 shrink-0 justify-self-center">
          <Image src={logoUrl || "/brand/logo.png"} alt="Jawhara" width={126} height={35} priority className={`h-[35px] w-auto object-contain ${transparent ? "brightness-0 invert" : ""}`} />
        </Link>

        <div className="col-start-3 flex shrink-0 items-center justify-end gap-4 sm:gap-5">
          <Link href="/search" aria-label="Sök">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.6" y2="16.6" />
            </svg>
          </Link>
          <button
            onClick={open}
            aria-label="Öppna varukorg"
            className={`relative ${justAdded ? "motion-safe:animate-cart-pop" : ""}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {count > 0 && (
              <span
                className={`absolute -right-2 -top-2 flex h-[16px] w-[16px] items-center justify-center rounded-full text-[9px] font-bold ${transparent ? "bg-white text-black" : "bg-fg text-bg"} ${
                  justAdded ? "motion-safe:animate-cart-pop" : ""
                }`}
              >
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
