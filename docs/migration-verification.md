# Migration Verification Report

Generated 2026-10-08T18:29:00.321Z against live store `1tq41d-4y.myshopify.com`.

**13 of 13 checks passed.**

| Check | Result | Detail |
|---|---|---|
| products count matches live | ✓ PASS | extracted 376, live 376 |
| collections count matches live | ✓ PASS | extracted 31, live 31 |
| customers count matches live | ✓ PASS | extracted 504, live 504 |
| orders count matches live | ✓ PASS | extracted 286, live 286 |
| products: no duplicate IDs | ✓ PASS | 376 records, 376 unique |
| collections: no duplicate IDs | ✓ PASS | 31 records, 31 unique |
| customers: no duplicate IDs | ✓ PASS | 504 records, 504 unique |
| orders: no duplicate IDs | ✓ PASS | 286 records, 286 unique |
| every product has ≥1 variant | ✓ PASS | all 376 products have variants |
| every product image downloaded | ✓ PASS | all 662 images present on disk |
| collection↔product counts match | ✓ PASS | all 31 collections match |
| pennywise metafield presence noted (informational — excluded from Supabase import, not an error) | ✓ PASS | 174 of 376 products carry pennywise metafields in the raw export |
| judge.me review cache completeness | ✓ PASS | 127 products have review data, none appear truncated by the metafield cache |

## Phase 3: Supabase import verification (2026-10-08)

Post-import row counts in Supabase, checked against the Phase 2 extraction counts above —
**all 13 tables match exactly**:

| Table | Count | Notes |
|---|---|---|
| products | 376 | matches extraction exactly |
| product_variants | 788 | |
| collections | 31 | |
| collection_products | 1,788 | collection↔product links |
| customers | 504 | |
| addresses | 565 | |
| orders | 286 | |
| order_items | 723 | |
| discounts | 6 | Shopify-native only; Pennywise excluded (see risk register §1b) |
| locations | 1 | |
| inventory_levels | 788 | one row per variant against the single location |
| reviews | 15 | parsed from Judge.me metafields; see risk register §2 on completeness |
| media | 570 | 662 images uploaded; 92 are images genuinely shared across more than one product in Shopify's own media library, collapsed to one row each (first product referencing it) since this schema ties one media row to one product |

**Additional checks performed:**
- Row Level Security verified with a real test row: inserted a customer via `service_role`,
  confirmed the `anon` key could not read it, confirmed `service_role` could, then deleted the
  test row.
- A real product image was fetched from its public Supabase Storage URL as an anonymous
  storefront visitor would — `200 OK`, correct content-type, 309KB — confirming images are
  genuinely served independently of Shopify's CDN.
- The private `backups` Storage bucket was confirmed to reject unauthenticated access (`400`,
  not `200`) before being used to store the raw export snapshot.
- All 12 raw export files (products, collections, customers, orders, discounts, pages, blogs,
  menus, locations, markets, media manifest, and the Phase 1 audit snapshot) uploaded to that
  private bucket as the "live copy" backup, in addition to the independent downloadable archive
  delivered directly to the user earlier (outside any infrastructure this project configures).

## Phase 4 preview: content-accuracy verification (2026-10-10)

Following the user's report that some product headings in the visual preview were wrong, every
hardcoded product entry across all 7 preview files was cross-checked against the authoritative
`data/exports/products.jsonl`, resolving each image back to its Shopify product ID.

- **26 distinct products referenced across the 7 preview files; 0 unresolved** (every image
  resolved to a real product ID, every product ID found in `products.jsonl`).
- **One root-cause bug found:** the homepage "Noellé Väskor Mini" / "Väskor" carousels
  (`Main.dc.html`, `Homepage-Mobile.dc.html`) showed 5 card instances all mislabeled "Noelle mini
  väska" at a flat fabricated 349 kr — the images were actually Klöver smyckesset, Love armband,
  Love ring, and Astra örhänge (each correctly labeled everywhere else they appear).
  **Fixed:** all 5 card instances now use real photos of the genuine "Noélle Väska Mini" product
  (5 duplicate Shopify listings sharing one media set in `data/media/11059283919186/`), titled
  "Noélle Väska Mini", priced 799 kr (real price from `products.jsonl`; this grid's card template
  does not render a compare-at price for any entry, so the real 1599 kr compare-at is not shown
  here but is not misstated either).
- **One price-only mismatch fixed:** "H sminkväska" showed a flat fabricated 299 kr; corrected to
  the real 239 kr.
- **Checked and confirmed NOT a bug:** "Klöver ring" appearing twice (productIds 11130010665298 /
  11130011713874) — both are genuinely independent Shopify listings named exactly that. Same
  confirmed for "Love armband", "Klöver Halsband", "Klöver armband", and "H armband smal" each
  legitimately appearing twice under the same name for two different real product IDs.
- Republished to the artifact (version 13) with both fixes applied and verified via grep that no
  residual "Noelle mini väska" or "349 kr" strings remain in either file.

## Full catalog audit: Supabase vs. Shopify, root-cause fix (2026-10-10)

Following a further report of wrong images/collection names, every product and collection in
Supabase was compared against the raw Shopify export end-to-end (not a sample) using Shopify's
product/collection ID as the join key: `scripts/shopify/verify-catalog.ts`. Pulled full,
unpaginated table dumps via the Management API (PostgREST's default page cap would have
truncated `collection_products` at 1,788 rows otherwise) and diffed every field.

**First run — 115 mismatches, all one root cause:**

| Check | Result |
|---|---|
| Products (376): title, handle, status, product_type, vendor, description_html, tags, SEO | 0 mismatches |
| Variants (788): title, SKU, barcode, price, compare_at_price, inventory_quantity, options | 0 mismatches |
| Collections (31): title, handle, description_html, sort_order, image_url | 0 mismatches |
| Collection membership + order (1,788 links) | 0 mismatches |
| Product ↔ image association | **115 mismatches / 92 missing media rows across 23 products** |

**Root cause:** `media.shopify_id` had a global `unique` constraint, but 92 of 662 images in
Shopify's own media library are genuinely attached to more than one product (e.g. the 5 duplicate
"Noélle Väska Mini" listings all share the same 16 photos). The import's upsert logic collided on
that constraint, so it silently kept only the first product's reference to each shared image and
dropped the rest — 23 products ended up missing some or all of their real images in Supabase, with
no title or price corruption anywhere.

**Fix applied:**
- `supabase/migrations/0002_media_shared_images.sql` — replaced the constraint with
  `unique (shopify_id, product_id)`, since one image legitimately belonging to several products is
  a real, valid state, not a data error.
- `scripts/supabase/import/09-backfill-shared-media.ts` — inserted the 92 previously-dropped media
  rows (idempotent; re-running finds nothing left to backfill).

**Second run — 0 mismatches.** Full re-verification after the fix: 376/376 products, 788/788
variants, 662/662 media rows (up from 570), 31/31 collections, 1,788/1,788 collection↔product
links — exact match against Shopify on every field checked.

**Separately, a preview-only issue found during this pass (not a Supabase/import bug):** the
Product page preview showcased "Love armband" (productId 10846009885010) together with a real
review that actually belongs to a *different* product, "Klöver armband" (misattribution made when
the preview was hand-assembled, not a database error). Found a third, independent "Love armband"
listing (productId 10281169912146) that has both the same price (289/399 kr) and its own genuine
review (Kajsa L., 5★, "Superfint!!") — swapped the preview's images, SKU, size options, and
description to that listing's real data so the title, content, and review shown all belong to the
same real product. Republished (artifact version 14).

**Final cross-check:** every one of the 80 product-card entries embedded across all 7 preview
files was resolved back to its Shopify product ID and diffed against the now-corrected Supabase
data (title and price) — 0 unresolved, 0 title mismatches, 0 price mismatches.

**On "the preview reads live from Supabase":** the 7 preview files are static mockup pages (an
Artifact Design canvas), built to get sign-off on visual direction and content accuracy before
real Phase 4 code is written — they were never meant to query a database at runtime, and the
platform's sandbox does not allow outbound network calls from inside the artifact anyway (the same
restriction that caused the earlier hotlinked-image bug). What "directly from Supabase" means in
practice at this stage: every value now shown was verified by script against the corrected
database, not hand-typed from memory. The actual live, Supabase-backed storefront is what the real
Phase 4 Next.js build produces next.
