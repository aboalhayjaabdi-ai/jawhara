# Jawhara — Design Specification (Phase 2.5 deliverable, for your review)

This is an analysis of the current "Jawhara 3.0" theme's actual design language (pulled directly
from its settings and templates, not guessed) plus the proposed direction for the new platform.
**Nothing in Phase 4 gets built until you approve this doc** — per your requirement, this
preserves brand identity and direction while upgrading execution, not a generic redesign.

## Current design language (as implemented today)

**Palette:** Strictly monochrome — pure white background (`#ffffff`), pure black foreground
(`#000000`), with secondary tones (`color1`, `color2`) used sparingly for sale badges and
border/input accents. No color beyond black/white in the base palette.

**Typography:** Serif/sans pairing — **Newsreader** (serif) for all headings (h1–h3) and
subheadings, **Red Hat Text** (sans) for body copy and accent/button text. H1 is set large (120px)
with tight line height for high-impact hero moments; h5/h6 and buttons are uppercase, small, and
wide-tracking — a classic editorial/boutique treatment.

**Shape language:** Zero corner radius, everywhere — buttons, product cards, inputs, badges,
variant swatches, popovers. This is a deliberate sharp-edged, architectural aesthetic, consistent
with a premium jewelry positioning (not a soft/rounded "friendly" style).

**Buttons:** Primary = solid black fill, white text, uppercase, no border radius. Secondary =
white fill, black text, 1px black border. High contrast, minimal.

**Product imagery:** Media gallery in a grid layout, left-positioned thumbnails, 1:1.25 aspect
ratio (slightly portrait — flattering for jewelry on a model/mannequin or macro product shots),
zoom enabled on hover, product details panel sticky on desktop scroll.

**Cart:** Drawer-style (slide-in from the side), not a redirect to a separate cart page.

**Homepage structure:** Content-dense and merchandising-heavy — 18 sections total: 3 hero
banners, 1 marquee (scrolling text/logo strip), 8 separate product-list carousels (by category/
collection), 1 collection-links grid, 1 featured-product spotlight, plus supporting content
blocks. This reflects a catalog-forward strategy showing many curated product groupings rather
than a single hero + minimal content homepage.

**Navigation:** Hem (Home), Alla smycken (All jewelry), Armband (Bracelets), Halsband (Necklaces),
Ringar (Rings), Örhängen (Earrings), Väskor (Bags), Tillbehör (Accessories) — category-first
navigation matching the collection structure.

**Current third-party layer:** Judge.me reviews rendered via a theme app block (registered
globally in theme settings); Pennywise bundle-pricing UI injected via product metafield-driven
script (excluded from migration per your decision).

## What this tells us about brand identity

Monochrome + serif headlines + zero radius + uppercase accents = a **quiet luxury / editorial
jewelry** positioning, not a "trendy DTC" look. The homepage's density (many product carousels)
suggests the merchandising strategy already works for this catalog size (376 products across 31
collections) — visitors browse by category grouping rather than relying on a single curated hero.

## Proposed direction for the new platform — same identity, upgraded execution

**Keep unchanged (this is your brand, not ours to redesign):**
- Monochrome black/white palette as the base
- Newsreader + Red Hat Text pairing (or a near-identical modern equivalent if licensing requires
  a swap — to confirm during Phase 4 font licensing check)
- Zero-radius, sharp-edged shape language
- Uppercase, wide-tracking button/label treatment
- Drawer cart (not a redirect)
- Category-first navigation structure
- Catalog-forward homepage strategy (multiple curated product groupings, not a single hero)

**Improve:**
- **Performance:** current theme ships 125 JS assets loaded via traditional Shopify theme
  architecture; Next.js with route-level code splitting, image optimization (`next/image`
  generating responsive srcsets from the now-independent Supabase-hosted images), and server
  components for static content will cut load time substantially, especially on mobile.
- **Product imagery presentation:** keep the 1:1.25 gallery ratio and left-thumbnail pattern
  (it works), but add true pinch-to-zoom on mobile (not just desktop hover-zoom) and lazy-load
  below-the-fold carousel images.
- **Collection filtering:** current theme's filter UI is standard Dawn-derived faceting; the new
  build adds instant (no full page reload) filtering by price/metal/type with URL-synced state
  for shareable filtered views.
- **Checkout:** current cart drawer → Shopify-hosted checkout handoff; new build keeps the drawer
  but moves checkout fully in-platform (Stripe Elements + Klarna), removing the redirect-to-
  another-domain step entirely — a direct conversion improvement.
- **Mobile responsiveness:** audit and tighten the 18-section homepage specifically for mobile
  scroll length/performance — likely consolidating some adjacent product-list sections rather than
  removing the catalog-forward strategy itself.
- **Reviews:** same visual presentation as Judge.me's current widget (star rating, review count,
  verified-buyer badge) but rendered from our own `reviews` table — no external script, faster
  render, no layout shift while the widget loads.
- **Admin control:** the basic visual section editor (your requirement) lets you rebuild/reorder
  this kind of hero + product-list + banner homepage structure yourself, without needing a
  developer for every merchandising change — matching how you already use it today, just without
  Shopify.

## What needs your decision before Phase 4 starts

1. **Font licensing** — Newsreader is open-source (Google Fonts, free to use anywhere). Red Hat
   Text is also open-source (Google Fonts). Both can be used directly with no licensing concern —
   no decision needed here, just confirming for the record.
2. **Homepage section count** — keep all 18 sections 1:1, or consolidate some of the 8 product-list
   carousels during the rebuild? Recommend reviewing current analytics (if available) for which
   carousels actually get engagement before deciding — can revisit once Phase 6 analytics exist.
3. **Any specific pages/sections not sampled here** you want called out before Phase 4 begins —
   this doc is based on the homepage, product template, and cart; collection pages, the FAQ page,
   and account pages weren't individually detailed above but are included in the full theme
   extraction for reference.

Reply with changes or approval — Phase 4 storefront code won't start until you confirm this.
