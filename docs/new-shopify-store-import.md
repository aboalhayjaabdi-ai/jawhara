# New Shopify store: catalog import (runs in the background, live site untouched)

Target store: `NEW_SHOPIFY_STORE_DOMAIN` (env). Live store and checkout: `SHOPIFY_STORE_DOMAIN`,
which keeps serving jawhara.se until switch-over day.

## Guarantees

- Every script in `scripts/new-shopify/` **writes only to the new store** (`client.ts` reads only
  `NEW_SHOPIFY_*` and refuses to run if the new domain equals the live one).
- The live store is only **read** (`dump-old-store.ts`, `dump-old-discounts.ts`, `import-policies.ts`
  read side). Supabase is not read or written by the import.
- `scripts/**` is excluded from `tsconfig.json`, so none of this is part of the Next.js build.

## What is copied: an exact clone of the live store

Products (445, including 7 Shopify-only draft rings) and variants (771), with the same handle,
title, description, vendor, tags, template suffix, category, status, option names, values and
order, variant order, SKU, price, compare-at price, **taxable = false**, inventory policy,
**tracked = false**, requires shipping, weight 0 kg, and quantities. **No images**, because the live
store has none. Shopify gives every product and variant its own new unique ID.

Collections (42) with the same handle, title, description, sort order, members and manual order. No
images.

Sales channels: Online Store → Online Store, Shop → Shop, Jawhara Headless → the new store's Headless
storefront. Lovable is not carried over.

Discounts: the active ones only (3 för 2, Valfri Plånbok, RABATT20F), with identical rules, scoped
to the new store's own collections and products. Expired/test discounts are skipped.

Policies: refund, shipping, terms and contact copied verbatim. Privacy policy needs "automatic
management" turned off in the new store's admin (Settings → Policies) first, then re-run
`import-policies.ts`.

## Run / re-run (all idempotent)

```bash
SP=<scratch dir>
npx tsx scripts/new-shopify/dump-old-store.ts $SP/old-store.json
npx tsx scripts/new-shopify/import-catalog.ts $SP/old-store.json
npx tsx scripts/new-shopify/dump-old-discounts.ts $SP/old-discounts.json
npx tsx scripts/new-shopify/import-discounts.ts $SP/old-discounts.json
npx tsx scripts/new-shopify/import-policies.ts
npx tsx scripts/new-shopify/verify-catalog.ts $SP/old-store.json $SP/mapping.json
```

Re-run the first two plus verify right before switch-over, so price changes made in the meantime
are carried over. `verify-catalog.ts` checks every field and writes the old → new ID mapping
(products, variants, collections) that the site's `shopify_product_id` / `shopify_variant_id`
columns are repointed with on switch-over day. The mapping is matched by handle and selected
options and can be regenerated at any time.

## Not done yet (on purpose, switch-over day)

- Supabase `shopify_*_id` columns still point at the live store. Not touched.
- Site env vars (`SHOPIFY_*`) still point at the live store. Not touched.
- Webhooks on the new store: not registered yet. They would post to jawhara.se's live webhook
  endpoint, so they are added at switch-over.
- Website-only draft product `rh-skal` (100 variants) is not in the live store, so it is not in the
  new one either.

## Status (2026-11-12)

- 445 products, 771 variants, 42 collections imported; `verify-catalog.ts`: no differences, 445/771
  unique new IDs. Live store re-read after the import: unchanged.
- Discounts 3 för 2, Valfri Plånbok, RABATT20F: identical rules (compared field by field).
- Headless storefront token: sees all 385 active products; `cartCreate` works (no checkout made).
