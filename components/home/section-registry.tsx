import { Hero } from "@/components/home/hero";
import { Marquee } from "@/components/home/marquee";
import { TextSection } from "@/components/home/text-section";
import { ProductListSection } from "@/components/home/product-list";
import { CollectionLinks } from "@/components/home/collection-links";
import { FeaturedProductSection } from "@/components/home/featured-product";
import { ComparisonSlider } from "@/components/home/comparison-slider";
import { homeHeroOverlaysHeader, type HomeSection, type ProductCard } from "@/lib/queries";
import { resolveProductListsInOrder } from "@/lib/product-sections";

/**
 * Resolves every visible product_list section's products in page order, so a section configured
 * with `unique: true` can skip products already shown above it. Shared by the real homepage and
 * the admin preview so both render identically.
 */
export async function resolveSectionProducts(
  sections: HomeSection[],
  /** Sections whose products were already chosen (lib/campaign-homepage.ts); used as-is. */
  presetProducts: Map<string, ProductCard[]> = new Map()
): Promise<Map<string, ProductCard[]>> {
  const specs = sections
    .filter((s) => s.visible && s.type === "product_list" && !presetProducts.has(s.id))
    .map((s) => {
      const c = s.config as any;
      return { key: s.id, spec: { collectionHandle: String(c.collectionHandle ?? ""), limit: Number(c.limit ?? 4), sort: c.sort, unique: c.unique === true } };
    })
    .filter((s) => s.spec.collectionHandle);
  const preset = new Set([...presetProducts.values()].flat().map((p) => p.id));
  const resolved = await resolveProductListsInOrder(specs, preset);
  return new Map([...resolved, ...presetProducts]);
}

/**
 * The single rendering path for a homepage section, shared by the real homepage
 * (app/(storefront)/page.tsx, reading the published layout) and the admin preview route
 * (app/(storefront)/preview/page.tsx, reading the draft or a historical version) -- so the
 * preview is pixel-identical to production by construction, never a second rendering engine.
 * Dispatches into the exact same components the storefront has always used; a section whose
 * config is missing a required field (e.g. a brand-new, not-yet-configured section) is skipped
 * rather than crashing the page.
 */
export function SectionRenderer({
  section,
  products,
  isFirstProductList = false,
  overlayHeader = false,
}: {
  section: HomeSection;
  products?: ProductCard[];
  isFirstProductList?: boolean;
  /** Set by SectionList only for the live homepage's first section (see homeHeroOverlaysHeader). */
  overlayHeader?: boolean;
}) {
  if (!section.visible) return null;
  const c = section.config as any;

  switch (section.type) {
    case "hero":
      if (!c.desktopImage || !c.buttonText || !c.buttonHref) return null;
      return c.variant === "split-bottom" ? (
        <Hero key={section.id} variant="split-bottom" desktopImage={c.desktopImage} mobileImage={c.mobileImage} buttonText={c.buttonText} buttonHref={c.buttonHref} height={c.height} mobileHeight={c.mobileHeight || undefined} mobileObjectPosition={c.mobileObjectPosition || undefined} fit={c.fit === "contain" ? "contain" : undefined} heading={c.heading ?? ""} />
      ) : (
        <Hero key={section.id} variant="centered-cta" desktopImage={c.desktopImage} mobileImage={c.mobileImage} buttonText={c.buttonText} buttonHref={c.buttonHref} height={c.height} mobileHeight={c.mobileHeight || undefined} mobileObjectPosition={c.mobileObjectPosition || undefined} fit={c.fit === "contain" ? "contain" : undefined} topText={c.topText || undefined} overlayHeader={overlayHeader} />
      );
    case "marquee":
      if (!Array.isArray(c.items) || c.items.length === 0) return null;
      return <Marquee key={section.id} items={c.items} />;
    case "product_list":
      if (!c.collectionHandle || !c.heading) return null;
      return (
        <ProductListSection
          key={section.id}
          collectionHandle={c.collectionHandle}
          heading={c.heading}
          limit={c.limit ?? 4}
          layout={c.layout}
          buttonText={c.buttonText || undefined}
          buttonHref={c.buttonHref || undefined}
          variant={c.style === "campaign" ? "campaign" : "default"}
          intro={c.intro || undefined}
          sort={c.sort}
          products={products}
          priorityImages={isFirstProductList ? 2 : 0}
        />
      );
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

/** Renders a full section list (live homepage or admin preview). */
export async function SectionList({
  sections,
  allowHeaderOverlay = false,
  presetProducts,
}: {
  sections: HomeSection[];
  allowHeaderOverlay?: boolean;
  presetProducts?: Map<string, ProductCard[]>;
}) {
  // Only the live homepage gets the transparent-header banner -- the admin preview renders under
  // its own preview bar and a normal header, so it keeps the regular layout.
  const overlayId = allowHeaderOverlay && homeHeroOverlaysHeader(sections) ? sections.find((s) => s.visible)?.id : undefined;
  const products = await resolveSectionProducts(sections, presetProducts);
  const firstProductListId = sections.find((s) => s.visible && s.type === "product_list")?.id;
  return (
    <>
      {sections.map((s) => (
        <SectionRenderer key={s.id} section={s} products={products.get(s.id)} isFirstProductList={s.id === firstProductListId} overlayHeader={s.id === overlayId} />
      ))}
    </>
  );
}
