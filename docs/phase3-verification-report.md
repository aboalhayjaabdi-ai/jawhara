# Phase 3 verification report — products, variants, collections & inventory management

Date: 2026-10-11. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Full CRUD admin platform for products, variants, images, collections, product templates,
inventory, bulk editing and CSV import/export — at the depth requested ("same depth of
functionality and professional user experience as Shopify Admin"). Built on top of the already-
approved Phase 1 (admin shell/security) and Phase 2 (order management) work, with every standing
constraint preserved: the live Shopify store was never written to, the production domain/DNS was
never touched, `app/api/checkout`, `app/api/webhooks/stripe`, and `lib/discounts.ts`'s calculation
logic are byte-for-byte unchanged (confirmed below), and every mutation goes through
`requireAdmin()` + `logAdminAction()`.

## 1. Database migrations

- **`0013_phase3_catalog_schema.sql`** — `product_variants.weight`/`weight_unit`;
  `products.source`/`collections.source` (backfilled from `shopify_id`); new `inventory_movements`
  ledger table; new `product_templates` and `collection_tile_items` tables; extended
  `decrement_inventory`/`force_decrement_inventory` with trailing default params.
- **`0014_phase3_inventory_note.sql`** — added a `p_note` param to `force_decrement_inventory` so
  admin-initiated adjustments can carry a free-text reason.
- **`0015_fix_inventory_function_overload_ambiguity.sql`** — see **Critical issue found and fixed**
  below.
- Data backfill: `scripts/supabase/backfill-product-templates.ts` (kept in the repo, same
  convention as earlier one-time backfill scripts) copied all 8 `product_templates` rows and ~24
  `collection_tile_items` rows **directly from the live TypeScript source objects**
  (`lib/product-templates.ts`'s old `PRODUCT_TEMPLATES`, `lib/collection-tiles.ts`'s old
  `COLLECTION_TILE_GROUPS`), not hand-transcribed SQL — verified byte-for-byte identical via
  `assert.deepStrictEqual` against the original objects before those files were rewritten.

## 2. Critical issue found during this verification pass, and fixed

**`CREATE OR REPLACE FUNCTION` does not replace a function whose parameter *count* changed — it
creates a new overload alongside the old one.** Migrations 0013 and 0014 each added trailing
params to `decrement_inventory`/`force_decrement_inventory`, which silently left the *original*
2-argument versions (from migrations 0005/0009) still defined in the database. By the time this
pass started, Postgres had **2 overloads of `decrement_inventory`** and **3 overloads of
`force_decrement_inventory`**. A 2-argument call — exactly what the live, untouched Stripe webhook
(`app/api/webhooks/stripe/route.ts`) makes on every real checkout — became ambiguous:

```
Could not choose the best candidate function between:
  public.force_decrement_inventory(p_variant_id => uuid, p_qty => integer),
  public.force_decrement_inventory(p_variant_id => uuid, p_qty => integer, p_reason => text, ...)
```

This was a real, already-live bug: it broke the production checkout webhook's inventory decrement
from the moment migration 0013 was applied, in an earlier session, before this one started.
Confirmed by direct RPC call before the fix (reproduced the exact error above) and fixed by
`0015_fix_inventory_function_overload_ambiguity.sql`, which drops every superseded overload so
each function name resolves to exactly one definition. Re-verified after the fix:
- `decrement_inventory`/`force_decrement_inventory` called with only their original 2 args
  (`p_variant_id`, `p_qty`) now resolve and execute correctly, producing the expected
  `inventory_movements` ledger rows with default `reason`/`order_id`/`actor_id`.
- The fuller-argument calls used by the new admin code (5 and 6 args) still work correctly too.
- `pg_proc` now shows exactly one overload per function name.

**This means the live Stripe webhook's inventory decrement is fixed by this report, not just left
alone** — it had been silently broken since the earlier session's migration, and this phase's own
verification pass is what caught it. No webhook code was changed; the fix is entirely in the SQL
function definitions.

## 3. Products

Full CRUD at `/admin/products`: list with search/status/vendor/collection/stock-level filters and
bulk-select; create (always with one default variant); detail page with core fields (title,
vendor, product type, tags, rich-text description via Tiptap, template assignment), inline
variant table (SKU, barcode, price, compare-at, tracked/untracked toggle, inventory policy,
weight, options, per-row inventory-adjust popover, availability preview), drag-and-drop image
manager (upload, reorder, alt text, variant-image assignment, delete) via `@dnd-kit`, SEO fields,
and a sidebar with status/handle (typed-confirmation gate on Shopify-origin handle changes),
duplicate (configurable image/quantity copy), and delete (typed-confirmation, with a review/order/
discount-impact warning). Bulk actions: status, tag add/remove, collection add/remove (with
discount-impact warning), price adjustment, delete. CSV export (one row per variant, Shopify-
compatible column shape) and a CSV import wizard (upload → preview with per-row errors/warnings
and deselect checkboxes → commit), matching on **handle** for products and **option-tuple → SKU**
for variants, never deleting anything missing from the file.

## 4. Collections

Full CRUD at `/admin/collections`: list, create, detail page with core fields, SEO, image upload
(into the existing `product-media` bucket), handle-change confirmation gate, a drag-and-drop
product-membership manager (add via search, reorder, remove — each removal checked against the
discount guard), and, for collections with a `template_suffix`, a tile-group editor over the new
`collection_tile_items` table. Delete with a discount-impact warning.

## 5. Product templates

Admin UI at `/admin/product-templates` over the new DB-backed `product_templates` table: list
(showing cross-referenced product/collection usage), create/edit with a shared rich-text editor
for every genuinely-HTML field (intro, USP blocks, FAQ, accordion rows, offer message).

## 6. Storefront migration to DB-backed content

`lib/product-templates.ts` and `lib/collection-tiles.ts` were rewritten from static, hardcoded
objects to async functions reading the new tables (`getProductTemplateContent`,
`getCollectionTileGroup`), with the exact same exported types and null-on-no-match contract as
before. Since `components/product/product-detail.tsx` is a client component that previously
called the old function synchronously, the fetch moved up to its server-component parent
(`app/(storefront)/products/[handle]/page.tsx`), passing the resolved content down as a prop.
`components/collection/subcategory-tiles.tsx` needed only a one-line swap (already an async server
component). **Regression-checked**: an unedited product's template content and an unedited
collection's subcategory tiles render identically to the pre-migration static version (verified
both via a direct DB data-parity check — all 8 `product_templates` rows and 24
`collection_tile_items` rows present and correctly resolved — and via a live Playwright render of
`klover-armband`/`armband`, see below).

## 7. Inventory

- **Ledger**: `inventory_movements`, with every decrement/increment path (checkout webhook, order
  cancellation restock, return restock, manual-order consumption, admin adjustment) now writing a
  row with a real `reason`, and `order_id`/`actor_id` where applicable. `lib/inventory/restock.ts`
  and `lib/inventory/consume.ts` were extended with a context parameter threaded from their real
  callers (`orders/[id]/actions/cancellation.ts` → `reason:'cancellation'`,
  `.../returns.ts` → `reason:'return_restock'`, the manual-order `mark_paid` path → order/actor
  attribution on `reason:'sale'`). The Stripe webhook itself needed zero code changes — its
  existing 2-arg calls now resolve correctly (see the overload fix above) and pick up sensible
  defaults (`reason:'sale', order_id: null, actor_id: null`).
- **Admin adjustment**: `lib/admin/inventory-ledger.ts`'s `adjustInventory` (set/delta modes,
  reasons: received stock, damaged, correction, manual), refusing server-side on untracked
  variants. Wired into a per-variant popover on the product detail page's variants table.
  Functionally verified (disposable variant, both modes, the negative-quantity guard, the
  untracked-variant refusal, and the resulting ledger rows all correct).
- **Views**: a per-variant "Lagerhistorik" section on the product detail page; a store-wide,
  paginated, reason/date-filterable history feed at `/admin/products/inventory/history`; a full
  paginated low-stock view at `/admin/products/inventory` with a configurable threshold. The
  dashboard's existing low-stock widget was refactored to call the same `getLowStockVariants`
  export the new full page uses, so the two can never disagree on what counts as low stock.

## 8. Discount-engine safety guard

`lib/admin/discount-guard.ts` mirrors `lib/discounts.ts`'s own matching logic (read-only) to warn
— never block — before a product delete, collection delete, or collection-membership removal that
would silently affect an active discount ("3 för 2" / "Valfri Plånbok"). `lib/discounts.ts`'s
calculation logic itself was not touched.

## 9. Navigation

`components/admin/admin-nav.ts` extended with Produkter, Kollektioner, Produktmallar, and Lager —
every link points at a page that now genuinely exists.

## 10. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean after every sub-area, and clean on the final
  combined pass.
- **Live browser verification** (Playwright against the local dev server, a disposable admin
  account created via the Supabase Auth admin API and fully deleted afterward, together with every
  test product/collection it created): 20/20 checks passed —
  login; products list; create product; core-form render; add + save a variant; the inventory-
  adjust popover (through the real UI); image upload; duplicate; archive→publish via the status
  control; bulk-select on the products list; product templates list; the CSV import wizard page;
  both inventory pages; create a collection; collection detail render; delete a product via its
  typed-confirmation flow; and a live storefront spot-check of an **unedited** product
  (`klover-armband`) and an **unedited** collection (`armband`), confirming Section 6's migration
  caused no visible regression.
- **CSV import round-trip**, exercised directly against the real library functions (not just
  through the browser): export-shaped CSV → edited price/quantity on an existing variant + a
  brand-new variant row appended → `parseProductsCsv` → `diffAgainstDatabase` (preview) →
  `commitImport` → confirmed the existing variant updated, the new variant inserted via its
  option-tuple, and a third, untouched variant left exactly as it was.
- **Inventory function backward-compatibility**, before and after the overload fix (Section 2):
  reproduced the ambiguity error, applied the fix, then confirmed both the original 2-arg calls
  and the new 5/6-arg calls work correctly and write correct ledger rows.
- **Diff review**: `git diff`/`git status` against the pre-Phase-3 commit confirm `app/api/checkout`,
  `app/api/webhooks`, and `lib/discounts.ts` are byte-for-byte unchanged.
- All disposable test data (products, collections, the test admin account, ad-hoc verification
  scripts) was deleted/removed after use; none of it is part of this commit.

## Known, deliberate scope cuts (carried over from the approved plan, not gaps)

No rule-based/automatic collections (manual membership + drag-and-drop ordering only, matching
what the schema already supported). CSV import never fetches image columns (avoids an SSRF
surface) and never deletes a product/variant missing from the file. Manual inventory adjustments
and the inline variant-table edit don't write to the ledger via a separate code path beyond what's
described above — they use the same `force_decrement_inventory` RPC as everything else.
`product_templates.key` is a soft string join to `template_suffix`, not a hard foreign key
(preserves the pre-existing silent-null-on-no-match behavior).

## Files touched

74 files in total: 3 new migrations, ~30 new admin components, ~20 new admin pages/actions/API
routes, the storefront's product-template/collection-tile read path (5 files), inventory
ledger/ledger-threading (4 files), and the admin nav. Full list available via `git status`.
