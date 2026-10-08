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
