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
  but moves checkout to **embedded Stripe Checkout** (Stripe-only, no separate Klarna build — see
  the migration plan's Phase 5 for the full reasoning), rendered inline on the Jawhara-branded
  page rather than a redirect to a separate domain — a direct conversion improvement that still
  gets Stripe's maintained, optimized checkout UI rather than a hand-built payment form.
- **Mobile responsiveness:** optimize *how* the 18-section homepage loads (code-splitting,
  lazy-loading below-the-fold sections, responsive images) — **per your explicit instruction, no
  sections or carousels are removed automatically.** Which sections appear, their order, and
  their content are controlled entirely through the admin editor below, not trimmed by us.
- **Reviews:** same visual presentation as Judge.me's current widget (star rating, review count,
  verified-buyer badge) but rendered from our own `reviews` table — no external script, faster
  render, no layout shift while the widget loads.
- **Admin control — full visual editor, required for launch:** add/remove/reorder every homepage
  section (drag-and-drop), edit banners/images/headings/text/buttons, manage featured
  products/collections per section, edit product and collection page content, toggle section
  visibility, and preview changes before publishing — all without code. This is broader than a
  typical starter CMS screen, scoped deliberately because that's what actually running an
  18-section, frequently-merchandised homepage without a developer requires.

## Visual previews — required before implementation (your explicit gate)

Before any production Phase 4 code is written, visual previews are built for your review and
approval: homepage (desktop + mobile), product page (desktop + mobile), collection page, cart
drawer, and checkout experience — using real Jawhara products/images already in Supabase, in the
design language described above. These previews are the actual next deliverable.

## Resolved decisions

1. **Font licensing** — Newsreader is open-source (Google Fonts, free to use anywhere). Red Hat
   Text is also open-source (Google Fonts). Both can be used directly with no licensing concern.
2. **Homepage section count** — all 18 sections preserved, none consolidated or removed. Mobile/
   performance work optimizes loading, not content. Section mix is yours to change later via the
   admin editor, not something decided upfront in code.
3. **Payments** — Stripe only, embedded Checkout. See the migration plan's Phase 5 for the full
   reasoning behind embedded vs. hosted vs. fully custom.

## Still open

1. **Any specific pages/sections not sampled here** you want called out before Phase 4 begins —
   this doc is based on the homepage, product template, and cart; collection pages, the FAQ page,
   and account pages weren't individually detailed above but are included in the full theme
   extraction for reference.

Reply with changes or approval — Phase 4 storefront code won't start until you confirm this.
