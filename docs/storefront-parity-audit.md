# Storefront Parity Audit — Jawhara 3.0 (Shopify) vs. Current Next.js Site

2026-10-10. Read-only audit, zero code changes made. Covers the 7 areas you flagged explicitly
plus an independent broader sweep for anything else customer-facing, per your "complete parity"
instruction. Every finding below is sourced from the real extracted theme files
(`data/exports/theme/`), real menu/collection data (`data/exports/*.jsonl`), a live re-pull of
Shopify's `templateSuffix` field (never captured in the original extraction), and the current
Next.js source — nothing here is invented or assumed. Pennywise: zero references found anywhere
in the theme export; confirmed excluded, nothing to restore.

---

## 1. Mobile hamburger navigation — MISSING, restore

**Real source:** `sections/header.liquid`, `blocks/_header-menu.liquid`,
`snippets/header-drawer.liquid`, `assets/icon-menu.svg`/`icon-close-menu.svg`,
`assets/header-drawer.js`, `data/exports/menus.jsonl` (authoritative link data).

- Hamburger sits in the header's leftmost grid cell; logo is forced to the center cell via its own
  grid placement — independent of nav content, so this doesn't risk logo centering.
- **Icon correction:** the real icon is **two horizontal lines**, not three. Flagging rather than
  inventing a third line.
- Opens a left-side drawer: native `<details>/<summary>` (click + Enter/Space), closes on Escape,
  focus-trapped while open.
- Drawer content is a **flat list, no sub-menus, no accordion, no images** (the menu has no nested
  items, so the drawer's richer rendering paths never trigger) — just 8 links, exact order and
  exact Swedish titles from the real `main-menu`:

  | # | Title (exact) | Links to |
  |---|---|---|
  | 1 | Hem | `/` |
  | 2 | Alla smycken | `/collections/alla-smycken` |
  | 3 | Armband | `/collections/armband` |
  | 4 | Halsband | `/collections/halsband` |
  | 5 | Ringar | `/collections/ringar` |
  | 6 | Örhängen | `/collections/orhangen` |
  | 7 | "Väskor " *(real trailing space in the source)* | `/collections/vaskor-och-tillbehor` |
  | 8 | Tillbehör | `/collections/tillbehor` |

  Verified: `vaskor-och-tillbehor` is a real, existing collection in the current database
  (title "Väskor") — this link will not 404.
- Accessibility strings from the real theme locale: "Meny" (menu label), "Primär" (nav landmark).
- Optional, not yet decided (see questions below): the real drawer also showed a language/country
  selector at the bottom — whether that was ever actually meaningful (more than one published
  market) can't be confirmed from theme files alone.

**Proposed files:** new `components/layout/mobile-nav-drawer.tsx`; small addition to
`components/layout/header.tsx` to render the trigger in the left grid cell on mobile only. Desktop
`<nav>`/MER dropdown in `priority-nav.tsx` is a separate code path — not touched.

---

## 2. SKU under every product title — MISSING everywhere except the PDP, restore

**Real source:** confirmed via direct code read, not inferred.

Today SKU renders in exactly one place: `components/product/product-detail.tsx:95` (already
correct, no change needed there). Everywhere else, the `sku` field isn't even *queried*:
- `getCollectionProductCards`, `getAllProductCards` (`lib/queries.ts`) — selects omit `sku`
  entirely; the shared `ProductCard` type and its `toCard()` mapper have no `sku` field at all.
- `getFeaturedProduct` → `getProductByHandle` *does* fetch `sku` (shares the PDP's query), but
  `components/home/featured-product.tsx` never reads/renders it.
- `getRelatedProducts` exists but is **never called anywhere** — there is currently no
  related/recommended-products section on the PDP at all (worth noting, though not something you
  asked to fix — flagging since your request #2 mentions "related products" as a place SKU should
  show, and that section doesn't exist yet to put it on).
- No search results exist to check (see §7).

**Proposed files:** extend the relevant `lib/queries.ts` selects + the shared `ProductCard` type
to carry `sku`; render it under the title in `components/product/product-card.tsx` (covers every
homepage carousel and every collection grid, since they all go through this one component) and in
`components/home/featured-product.tsx`. Nothing else about these components changes.

---

## 3. Product page informational content — MISSING, restore (varies by category — ties into §4)

**Real source:** all 9 `templates/product*.json` files, cross-checked against
`sections/section.liquid`, `blocks/accordion.liquid`, `config/settings_data.json` (confirmed: none
of this is theme-global — it's all per-template, which is why §4's template system matters).

Three distinct real content blocks, **not present on every template** — see §4 for the exact
per-template matrix:

1. **Trust-line bullets**, plain text (no icons exist anywhere in the source for this — if the
   restored design adds icons next to these lines, that's a new design choice, not a restoration):
   - Jewelry (armband/halsband/örhängen/ringar): `— 14 dagars öppet köp` / `— Fri frakt & Fria
     byten` / `— Betala säkert med Klarna` / `— Vattentåligt & nickelfritt`
   - Bags (vaskor): shorter 3-line variant, drops the jewelry-only claims: `— 14 dagars öppet köp`
     / `— Fri frakt` / `— Betala säkert med Klarna`
   - Absent from: default, erbjudande-vaskor, planbok, skal.

2. **4-column USP block** (jewelry templates only): "Vattentåliga smycken", "Fria byten",
   "Premium kvalitét" (contains a real source typo, "smcykena" — preserved, not corrected, per
   your "exact text" instruction), "Garanti" — exact copy in the full report detail below.

3. **FAQ accordion**, 5 Q&A (jewelry + vaskor, reused verbatim on vaskor despite literally asking
   "Har ni garanti på **era smycken**?" — *your* jewelry — on a bags template; a real inconsistency
   in the original site, not something we'd be introducing). Full Q&A text in §4 detail.

4. **Ring size-guide link** (ringar only): `Storlekstabell` → `/pages/ringstorlek`.

5. **Category-specific accordion rows** ("Smyckesvård"/care text, "Design" copy) — differ by
   category, full text in §4.

6. **Klarna/Shop Pay installment pricing message** ("Betala i delbetalningar") — Shopify's native
   price-block feature, enabled on every product template. **Flagging, not silently building**:
   this was Shopify's own dynamically-computed financing preview tied to Shopify Payments/Klarna —
   there's no equivalent signal in the current Stripe-only architecture without a real decision
   about whether/how to represent financing availability. See questions below.

**Found but correctly NOT restoring:** a gift-box upsell add-on block exists only in
`product.armband.json`, but it's configured `"disabled": true` in the real theme — it was never
actually shown to customers on the live site, so restoring it would add something that wasn't
really there.

**Proposed files:** new `lib/product-templates.ts` (static, real-content config keyed by template
suffix, same pattern as the existing `lib/pages-content.ts`), rendered from
`components/product/product-detail.tsx` based on the product's template assignment (§4). No change
to gallery, price, variant picker, buy button, or reviews.

---

## 4. CRITICAL — Category/product-specific product templates — MISSING, restore

**Real source:** live re-pull of Shopify's `templateSuffix` (this field was never captured in the
original extraction at all — `data/exports/products.jsonl` has no such key; confirmed and fixed by
pulling it fresh, read-only, directly from the Admin API).

### Real distribution (376 products, by real `templateSuffix`, not by collection membership)

| Template | Products | Notes |
|---|---|---|
| armband | 216 | |
| orhangen | 38 | |
| halsband | 34 | |
| ringar | 32 | |
| erbjudande-vaskor | 32 | "offer" bags — most bags use this, not the plain one |
| planbok | 16 | wallets |
| vaskor | 6 | plain bags |
| skal | 1 | "RH skal" — a phone case, see below |
| *(default, no suffix)* | 1 | "Presentbox" (archived gift-box utility product) |

**Real discrepancy vs. your expectation:** you listed Tillbehör as one of six category templates.
**No `product.tillbehor.json` ever existed** and zero products carry that suffix — only
`collection.tillbehor.json` (a collection template) exists. Tillbehör-category products (e.g. the
wallets given away in the bag offer) render via `product.planbok.json`. Not inventing a Tillbehör
product template that never existed.

### What's actually different per template (full detail; summarized in §3 above)

- **armband / halsband / örhängen / ringar** — the "full" templates: trust-line, 4-col USP block,
  FAQ, category-specific intro paragraph, "Smyckesvård"/"Design" accordion rows, SKU shown,
  Judge.me reviews widget. Ringar additionally has the size-guide link. Casing of accordion
  headings is genuinely inconsistent in the source ("Specifikationer" vs "specifikationer",
  "Smyckesvård" vs "smyckesvård") — reproducing as-is, not normalizing, per your "exact text" rule.
- **vaskor** — shorter 3-line trust block, "VÅrd" (odd capitalization, real) + "Design" accordion,
  FAQ reused (with the jewelry-wording mismatch noted above), no 4-col USP block.
- **erbjudande-vaskor** — minimal (no reviews widget, no USP block, no FAQ). Its real distinctive
  content: a gift-with-purchase message, *"Få en valfri plånbok på köpet!"* / *"Lägg väskan och en
  valfri plånbok från kategorin Tillbehör i kundvagnen – plånboken blir gratis."* Confirmed: this
  is plain static merchant copy describing a manual-cart bundle, **not Pennywise-related in any
  way** (zero Pennywise references anywhere in the theme). Separately, its intro paragraph is a
  leftover bug in the original site — byte-identical to the unrelated default/armband bracelet
  copy, never actually customized for bags. Flagging this pre-existing content bug rather than
  silently perpetuating or silently fixing it (see questions).
- **planbok** — leanest real template: short intro, one accordion row (dynamic description only),
  no trust-line/USP/FAQ/SKU block at all.
- **skal** — one-off, for one product ("RH skal", a silicone phone case with a built-in lip-gloss
  holder). Real bespoke marketing copy exists only in this template (not in the product's own
  Shopify description) — this explains why it got a dedicated template. Dropdown-style variant
  picker instead of buttons (the only template like this).
- **default/presentbox** — unfinished theme skeleton (stale English placeholder text), used only
  by one archived utility product tied to the disabled gift-box feature. No customer-facing
  restoration needed.

### Implementation approach proposed

1. Migration: add `products.template_suffix text` (same live-pull-and-backfill pattern already
   used successfully for the `inventory_tracked` fix).
2. `lib/product-templates.ts`: a config object keyed by suffix, holding each template's real
   content blocks (trust-line variant, USP block present/absent, FAQ present/absent, accordion
   rows, size-guide link, skal's bespoke copy) — this is the "maintainable system" your requirement
   #4.10 asks for; admin-editability of this content could be a later Phase 6 addition, not part
   of this change.
3. `components/product/product-detail.tsx`: render blocks conditionally based on the product's
   `template_suffix`, reusing the exact real config.

---

## 5. Collection subcategory tiles — MISSING on 5 real collections, restore (not all collections)

**Real source:** `sections/collection-list.liquid`, `blocks/_collection-card-image.liquid` +
`collection-title.liquid` (tiles pull their image/label live from each linked sub-collection's own
Shopify data — not custom per-tile text), cross-referenced against `data/exports/collections.jsonl`.

**Important, explicit finding:** only **5 collection templates were genuinely hand-configured**
with real subcategory lists: **armband, halsband, ringar, örhängen, alla-smycken**. `vaskor` and
`tillbehor` never had this section at all. Every "variant" template (guld-/silver-/rose-/klover-/
alla- pages) plus the generic default collection template all carry the exact same **leftover
boilerplate** tile list — not intentional configuration — so per your explicit instruction not to
apply this everywhere unless the original data really had it, **I'm proposing to restore it only
on the 5 real ones**, not on every collection page.

| Collection | Tiles (real Shopify titles, in order) | Image status |
|---|---|---|
| Armband | Alla armband, H Armband, H armband smal, Klöver Armband, **Guld armband**, **Silver Armband** | Last 2 tiles have **no image set in Shopify** (verified via your real collections data) |
| Halsband | Alla Halsband, Guld halsband, Silver halsband | All 3 have real images |
| Örhängen | Alla Örhängen, **Guld örhängen**, **Silver örhängen** | Last 2 have no image |
| Ringar | Alla Ringar, **Guld ringar**, **"Silver ringar"** | Last 2 have no image. Note: the 3rd tile's real Shopify *handle* is `guld-ringar` but its real *title* is "Silver ringar" — a genuine data mismatch in your Shopify store, not a transcription error here. |
| Alla smycken | Alla smycken, Armband, Halsband, Ringar, Örhängen | "Alla smycken" tile has no image; other 4 have real images |

All real collection handles above are confirmed to exist in the current database — no broken links.
None of these 13 collection images were ever downloaded during the original product/collection
media extraction (confirmed: different from any of the 662 already-pulled product images) — the
ones that do exist need a fresh fetch from their Shopify CDN URLs into Supabase Storage.

**Needs your input:** 6 of the 13 tiles across these 5 collections have **no image at all** in your
real Shopify data — never configured, nothing to restore. I won't invent one. See questions below
for how you'd like those specific tiles handled.

**Proposed files:** new `components/collection/subcategory-tiles.tsx`, rendered conditionally in
`app/collections/[handle]/page.tsx` only for the 5 real handles above, with their real tile lists.
Product grid, filters, sorting, and pagination on that page are untouched.

---

## 6. Desktop vs. mobile images — one real bug found, narrow fix

**Real source:** `sections/hero.liquid` (the only section type with a real desktop/mobile image
pair setting anywhere in the theme — confirmed by checking every homepage section type's schema),
`templates/index.json`, current `app/page.tsx`/`components/home/hero.tsx`.

Of the 3 homepage hero banners, **2 are already correctly wired** (hero1 "top banner", hero3
"Maximal glans...") — real distinct mobile images, confirmed different files via checksum, already
in place. **1 is not**: the "Premiummaterial och noggrant utvalda detaljer" banner
(`app/page.tsx`, the `hero2` call) passes only a `desktopImage` prop, no `mobileImage` — so mobile
falls back to the desktop crop. The correct mobile asset **already exists on disk**,
`public/brand/hero2-mobile.png` (confirmed genuinely different from the desktop image via
checksum), it's simply never referenced anywhere in the code.

**No other homepage section needs this.** Confirmed by reading every section type's real schema:
marquee, product-list (×7), the generic "section" type, collection-links, featured-product, and
the comparison-slider block all use one single image at every breakpoint (resized via `sizes`, not
swapped) in the original theme — this is not a pattern to apply broadly, only `hero.tsx` ever had
it, and only for these 3 banners.

**Proposed fix:** one line in `app/page.tsx` — add `mobileImage="/brand/hero2-mobile.png"` to the
existing hero2 call. Lowest-risk, highest-confidence item in this whole audit; happy to do this one
first/separately if useful.

---

## 7. Broader sweep — other real missing elements you didn't mention

Per your explicit "don't limit the audit to the examples" instruction. Confirmed real (actively
configured in the live theme, not unused/legacy capability) and confirmed absent from the new site:

- **Site-wide announcement bar** — 4 rotating Swedish promo lines, shown above the header on every
  page: *"3 FÖR 2 PÅ ALLA SMYCKEN!"*, *"KÖP EN VÄSKA - FÅ EN PLÅNBOK"*, *"FRI FRAKT!"*, *"60 DAGARS
  GARANTI!"*. Missing entirely from the new site.
- **Newsletter signup form** in the footer ("Prenumerera på vårt nyhetsbrev"). Missing — current
  footer has link columns and social links only.
- **Site search** — a real, actively-configured header feature (not a legacy capability), backed
  by predictive search + a results page in the original theme. Today the search icon in the header
  is purely decorative (no `onClick`, no `href`, no route behind it) — functionally missing.
- **Quick-add-to-cart** on product cards — actively enabled site-wide including mobile in the real
  theme settings. Current `product-card.tsx` is link-only, no add-to-cart affordance on cards.
- **Sold-out badge** on product-card thumbnails in grids/carousels — partially present (the PDP
  already says "Slut i lager"), but cards themselves show no equivalent overlay.
- Klarna/Shop Pay installment message — cross-referenced with §3 item 6 above.

**Confirmed already present, no action needed** — verified real content matches exactly: the
homepage trust marquee ("KLARNA" / "14 DAGARS ÖPPET KÖP" / "FRI FRAKT"), the FAQ page, the ring
size-guide page, the "Rea" sale badge on cards.

**Confirmed NOT applicable** — legacy/unused theme capabilities never actually configured in the
real site (no action, not flagged as missing): editorial grid layouts, quick-order-list (B2B),
product hotspots, gift-card recipient form (no gift-card product exists), a generic mega-menu
variant. Also confirmed: the already-known "jawhara-luxury-jewelry-landing-page" (English
placeholder copy, fabricated press mentions) was already correctly identified and excluded by your
own team in an earlier phase — no change.

**Needs your input (genuinely can't tell from theme files alone):**
- **Live chat widget** — the theme's chat markup is unconditionally present but inert unless
  Shopify Inbox was actually installed as an app on your live store, which isn't visible from
  exported theme files. Was it actually active?
- **Blog** — full theme capability exists (templates, section types) but this export has no actual
  post content, so I can't tell if you ever published real articles. Did you?
- **Country/language selector** — configured in the header, but whether a second market/language
  was ever actually *published* (which is what makes Shopify show a real switcher) isn't
  determinable from theme files.

---

## Explicitly confirmed staying untouched (per your Section 8)

Desktop header/nav and its MER dropdown, logo, fonts, brand colors, homepage section order
(16 sections), existing product card layout/images/pricing (beyond adding SKU), product
titles/descriptions/prices/inventory, existing product images, Stripe checkout/payment logic,
discount rules, admin dashboard, cart functionality, and everything from Phase 5/6 (VAT-as-setting,
delivery address collection, SE-only shipping, transactional emails, Vercel deployment, Supabase
Auth admin login) — none of this is touched by anything proposed above.

---

## Summary: proposed files

| Area | New files | Modified files |
|---|---|---|
| Mobile nav | `components/layout/mobile-nav-drawer.tsx` | `components/layout/header.tsx` (small addition) |
| SKU everywhere | — | `lib/queries.ts`, `components/product/product-card.tsx`, `components/home/featured-product.tsx` |
| Product info blocks + templates | `lib/product-templates.ts`, migration for `products.template_suffix` + backfill script | `components/product/product-detail.tsx` |
| Collection tiles | `components/collection/subcategory-tiles.tsx` | `app/collections/[handle]/page.tsx` |
| Hero mobile image fix | — | `app/page.tsx` (one line) |
| Announcement bar | `components/layout/announcement-bar.tsx` | `app/layout.tsx` |
| Newsletter signup | — | `components/layout/footer.tsx` + a new table/route for captured emails |
| Search | `app/search/page.tsx`, `app/api/search/route.ts` | header search icon wiring |
| Quick-add + sold-out badge | — | `components/product/product-card.tsx` |

Nothing else in the codebase is touched. Stripe/discounts/inventory/admin/checkout code is not
part of any proposed change above.
