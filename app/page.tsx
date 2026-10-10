export const revalidate = 60; // re-fetch prices/stock/collection membership at most once a minute

import { Hero } from "@/components/home/hero";
import { Marquee } from "@/components/home/marquee";
import { TextSection } from "@/components/home/text-section";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";
import { FeaturedProductSection } from "@/components/home/featured-product";
import { ComparisonSlider } from "@/components/home/comparison-slider";

// Section order and content below is pulled directly from the live theme's
// data/exports/theme/templates/index.json (16 visible sections; 2 further
// entries in that file are non-visual app-block config, not rendered here).
export default function HomePage() {
  return (
    <>
      <Hero
        variant="centered-cta"
        desktopImage="/brand/hero1-desktop.png"
        mobileImage="/brand/hero1-mobile.png"
        buttonText="UTFORSKA NU"
        buttonHref="/collections/alla-smycken"
        height="100vh"
      />

      <Marquee items={["KLARNA", "14 DAGARS ÖPPET KÖP", "FRI FRAKT"]} />

      <ProductListSection collectionHandle="h-armband" heading="H Armband" limit={7} layout="carousel" />
      <ProductListSection collectionHandle="klover-armband-1" heading="Klöver Armband" limit={7} layout="carousel" />
      <ProductListSection collectionHandle="noelle-mini-vaskor" heading="Noelle mini väskor" limit={6} layout="carousel" />

      <TextSection text="Utforska våra kollektioner" />
      <CollectionLinks handles={["armband", "halsband", "ringar", "orhangen"]} />

      <ProductListSection collectionHandle="bastsaljare-1" heading="Bästsäljare" limit={4} layout="grid" />
      <ProductListSection
        collectionHandle="vaskor-och-tillbehor"
        heading="Väskor"
        limit={4}
        layout="grid"
        buttonText="Se alla"
      />

      <FeaturedProductSection handle="rh-skal" />

      {/* Shopify's reserved /collections/all route (full catalog, no backing collection row).
          Exact Swedish title Shopify would show here wasn't recoverable from the export. */}
      <ProductListSection collectionHandle="all" heading="Alla produkter" limit={4} layout="grid" />

      <Hero
        variant="split-bottom"
        desktopImage="/brand/hero2-desktop.png"
        mobileImage="/brand/hero2-mobile.png"
        buttonText="Handla nu"
        buttonHref="/collections/all"
        heading={"Premiummaterial och\nnoggrant utvalda detaljer"}
        height="720px"
      />

      <ProductListSection collectionHandle="orhangen-copy" heading="Alla Örhängen" limit={6} layout="carousel" />

      <ComparisonSlider beforeImage="/brand/comparison-before.png" afterImage="/brand/comparison-after.png" />

      <ProductListSection collectionHandle="guld-halsband" heading="Guld halsband" limit={6} layout="carousel" />

      <Hero
        variant="split-bottom"
        desktopImage="/brand/hero3-desktop.png"
        mobileImage="/brand/hero3-mobile.png"
        buttonText="Handla nu"
        buttonHref="/collections/all"
        heading={"Maximal glans och design\nsom drar blickarna till sig"}
        height="720px"
      />
    </>
  );
}
