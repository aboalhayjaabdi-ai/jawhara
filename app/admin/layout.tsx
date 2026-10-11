import type { Metadata } from "next";
import { Newsreader, Red_Hat_Text } from "next/font/google";
import "../globals.css";

// A separate Next.js root layout (its own <html>/<body>) for the whole /admin subtree -- Next.js
// supports multiple root layouts via route groups precisely for cases like this, where the admin
// area must never render the public storefront's own header/announcement bar/footer/cart. See
// app/(storefront)/layout.tsx for the customer-facing root layout this mirrors structurally.
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
  title: { default: "Jawhara Admin", template: "%s | Jawhara Admin" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={`${newsreader.variable} ${redHatText.variable} bg-gray-50 font-sans`}>{children}</body>
    </html>
  );
}
