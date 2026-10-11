import { Hero } from "@/components/home/hero";
import { Marquee } from "@/components/home/marquee";
import { TextSection } from "@/components/home/text-section";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";
import { FeaturedProductSection } from "@/components/home/featured-product";
import { ComparisonSlider } from "@/components/home/comparison-slider";
import type { HomeSection } from "@/lib/queries";

/**
 * The single rendering path for a homepage section, shared by the real homepage
 * (app/(storefront)/page.tsx, reading the published layout) and the admin preview route
 * (app/(storefront)/preview/page.tsx, reading the draft or a historical version) -- so the
 * preview is pixel-identical to production by construction, never a second rendering engine.
 * Dispatches into the exact same components the storefront has always used; a section whose
 * config is missing a required field (e.g. a brand-new, not-yet-configured section) is skipped
 * rather than crashing the page.
 */
export function SectionRenderer({ section }: { section: HomeSection }) {
  if (!section.visible) return null;
  const c = section.config as any;

  switch (section.type) {
    case "hero":
      if (!c.desktopImage || !c.buttonText || !c.buttonHref) return null;
      return c.variant === "split-bottom" ? (
        <Hero key={section.id} variant="split-bottom" desktopImage={c.desktopImage} mobileImage={c.mobileImage} buttonText={c.buttonText} buttonHref={c.buttonHref} height={c.height} heading={c.heading ?? ""} />
      ) : (
        <Hero key={section.id} variant="centered-cta" desktopImage={c.desktopImage} mobileImage={c.mobileImage} buttonText={c.buttonText} buttonHref={c.buttonHref} height={c.height} />
      );
    case "marquee":
      if (!Array.isArray(c.items) || c.items.length === 0) return null;
      return <Marquee key={section.id} items={c.items} />;
    case "product_list":
      if (!c.collectionHandle || !c.heading) return null;
      return <ProductListSection key={section.id} collectionHandle={c.collectionHandle} heading={c.heading} limit={c.limit ?? 4} layout={c.layout} buttonText={c.buttonText} buttonHref={c.buttonHref} />;
    case "text":
      if (!c.text) return null;
      return <TextSection key={section.id} text={c.text} />;
    case "collection_links":
      if (!Array.isArray(c.handles) || c.handles.length === 0) return null;
      return <CollectionLinks key={section.id} heading={c.heading} handles={c.handles} />;
    case "featured_product":
      if (!c.handle) return null;
      return <FeaturedProductSection key={section.id} handle={c.handle} />;
    case "comparison_slider":
      if (!c.beforeImage || !c.afterImage) return null;
      return <ComparisonSlider key={section.id} beforeImage={c.beforeImage} afterImage={c.afterImage} heading={c.heading} buttonText={c.buttonText} buttonHref={c.buttonHref} />;
    default:
      return null;
  }
}
