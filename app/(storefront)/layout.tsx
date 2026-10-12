import type { Metadata } from "next";
import { Newsreader, Red_Hat_Text } from "next/font/google";
import "../globals.css";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AddToCartToast } from "@/components/cart/add-to-cart-toast";
import { CookieConsentAndTracking } from "@/components/marketing/cookie-consent-and-tracking";
import { getSiteMenus, getLogoUrl } from "@/lib/queries";
import { getPublicMarketingIds } from "@/lib/admin/marketing-settings";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [menus, logoUrl, marketingIds] = await Promise.all([getSiteMenus(), getLogoUrl(), getPublicMarketingIds()]);
  return (
    <html lang="sv">
      <body className={`${newsreader.variable} ${redHatText.variable} font-sans`}>
        <CartProvider>
          <AnnouncementBar />
          <Header navItems={menus.mainMenu} logoUrl={logoUrl} />
          {children}
          <Footer footerLinks={menus.footer} aboutLinks={menus.about} termsLinks={menus.terms} socialLinks={menus.social} />
          <CartDrawer />
          <AddToCartToast />
          <CookieConsentAndTracking metaPixelId={marketingIds.metaPixelId} ga4MeasurementId={marketingIds.ga4MeasurementId} />
        </CartProvider>
      </body>
    </html>
  );
}
