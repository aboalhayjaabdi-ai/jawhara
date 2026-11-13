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

Policies: refund, shipping, terms, contact and privacy copied verbatim, except that every
"jawharastore" (support@jawharastore.se and jawharastore.se policy links) becomes "jawharashop":
the new store uses support@jawharashop.se, and "jawharastore" must not appear in it at all.
`scan-jawharastore.ts` checks the whole new store for it.

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
- All 5 policies identical to the live store.
- Headless storefront token: sees all 385 active products; `cartCreate` works (no checkout made).

## Site support for two stores (built, not deployed)

`lib/shopify/stores.ts` adds `SHOPIFY_ACTIVE_STORE` (`legacy` unless set to exactly `new`).

- **Legacy (default, unset):** identical behaviour to before. Same env vars, same `shopify_*`
  columns, same single-store order sync, no extra API calls. The new columns are never read.
- **New:** cart/checkout (Storefront API), discount sync and manual invoices use the new store
  (`NEW_SHOPIFY_*` env vars, `new_shopify_*` columns). Cart ids from the new store reach the
  browser as `new:<gid>`, so a visitor's old legacy cart id is ignored and a fresh cart is made
  (and the reverse after a rollback).
- **Orders, both modes:** an order stays with the store it was placed in. In new mode the sweep
  (`/api/cron/sync-orders`, admin "Synka från Shopify") pulls both stores; webhooks are told apart
  by `X-Shopify-Shop-Domain` and verified with that store's secret; fulfilment, tracking edits,
  cancellations and Meta match data find the owning store via `storeForNode` (Shopify ids are global).

Tested locally: build + type-check clean; legacy mode against the live store (cart create/reuse,
"3 för 2" applied, foreign `new:` cart id ignored, bad webhook signature 401); new mode read-only
(store routing, both webhook secrets, storefront/admin calls hit the new store, a legacy order
resolves to legacy). Not yet testable: the new-mode cart, which needs migration 0049 applied.

## Switch-over runbook

Prep (no effect on the live site):
1. Apply `supabase/migrations/0049_new_shopify_store_ids.sql` (adds 3 empty nullable columns).
2. Deploy this code with `SHOPIFY_ACTIVE_STORE` unset. The site keeps running on legacy.
3. Add on Vercel: `NEW_SHOPIFY_STORE_DOMAIN`, `NEW_SHOPIFY_CLIENT_ID`, `NEW_SHOPIFY_CLIENT_SECRET`,
   `NEW_SHOPIFY_STOREFRONT_ACCESS_TOKEN`. Keep every `SHOPIFY_*` var (legacy orders need them).
4. Re-run dump + import + discounts + verify, then `fill-new-store-ids.ts <mapping> --write`.
5. Test the new-mode cart on a preview deployment with `SHOPIFY_ACTIVE_STORE=new`.

Switch:
6. Re-run step 4 (prices may have changed), set `SHOPIFY_ACTIVE_STORE=new` on production, redeploy.
   Vercel swaps deployments atomically, so checkout is never down.
7. `register-webhooks.ts`, then a test order: order lands in Supabase, Meta Purchase arrives.

Rollback: unset `SHOPIFY_ACTIVE_STORE`, redeploy. Orders already placed in the new store keep
syncing only if `SHOPIFY_ACTIVE_STORE=new`; after a rollback they are still in the new store's admin.
