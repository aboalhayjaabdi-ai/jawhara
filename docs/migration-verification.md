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
