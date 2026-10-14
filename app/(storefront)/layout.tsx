import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { Newsreader, Red_Hat_Text } from "next/font/google";
import "../globals.css";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AddToCartToast } from "@/components/cart/add-to-cart-toast";
import { CookieConsentAndTracking } from "@/components/marketing/cookie-consent-and-tracking";
import { PageViewTracker } from "@/components/marketing/page-view-tracker";
import { getSiteMenus, getLogoUrl } from "@/lib/queries";
import { getPublicMarketingIds } from "@/lib/admin/marketing-settings";
import { getGiftBoxOffer } from "@/lib/gift-box";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600"],
});

const redHatText = Red_Hat_Text({
  subsets: ["latin"],
  variable: "--font-red-hat-text",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se"),
  title: { default: "Jawhara", template: "%s | Jawhara" },
  description: "Jawhara — smycken och accessoarer",
};

// This layout wraps EVERY storefront route, including ones that can never be statically
// cached (e.g. /search, /pages/[handle] -- they read request-specific data elsewhere on the
// page). Without caching, that meant up to 4 live Supabase round trips (menus, logo, marketing
// IDs, the gift-box product+variants+media) before the header/nav/footer/cart drawer could even
// start rendering, on every single one of those requests. None of this data is per-visitor or
// security-sensitive -- unstable_cache (Next's cross-request Data Cache, unlike React's cache()
// which only dedupes within one request) lets every request reuse the same result for 60s,
// matching the revalidate=60 convention already used throughout this codebase.
const getCachedSiteMenus = unstable_cache(getSiteMenus, ["layout-site-menus"], { revalidate: 60 });
const getCachedLogoUrl = unstable_cache(getLogoUrl, ["layout-logo-url"], { revalidate: 60 });
const getCachedPublicMarketingIds = unstable_cache(getPublicMarketingIds, ["layout-public-marketing-ids"], { revalidate: 60 });
const getCachedGiftBoxOffer = unstable_cache(getGiftBoxOffer, ["layout-gift-box-offer"], { revalidate: 60 });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [menus, logoUrl, marketingIds, giftBoxOffer] = await Promise.all([
    getCachedSiteMenus(),
    getCachedLogoUrl(),
    getCachedPublicMarketingIds(),
    getCachedGiftBoxOffer(),
  ]);
  return (
    <html lang="sv">
      <body className={`${newsreader.variable} ${redHatText.variable} font-sans`}>
        <CartProvider>
          <AnnouncementBar />
          <Header navItems={menus.mainMenu} logoUrl={logoUrl} />
          <main>{children}</main>
          <Footer footerLinks={menus.footer} aboutLinks={menus.about} termsLinks={menus.terms} socialLinks={menus.social} />
          <CartDrawer giftBoxOffer={giftBoxOffer} />
          <AddToCartToast />
          <CookieConsentAndTracking metaPixelId={marketingIds.metaPixelId} ga4MeasurementId={marketingIds.ga4MeasurementId} />
          <Suspense fallback={null}>
            <PageViewTracker />
          </Suspense>
        </CartProvider>
      </body>
    </html>
  );
}
