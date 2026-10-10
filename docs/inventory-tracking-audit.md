# Inventory Tracking Audit & Fix (2026-10-10)

## Root cause

The original Shopify extraction (`scripts/shopify/extract/products.ts`) correctly queried
`inventoryItem { tracked }` and `inventoryPolicy` for every variant, and the raw export
(`data/exports/products.jsonl`) has always had this data. The bug was downstream:

1. **`inventoryItem.tracked` was never imported into Supabase at all** — no column existed for
   it, so it was silently dropped during the Phase 3 import (`scripts/supabase/import/03-products.ts`).
2. **`inventory_policy` *was* imported, but was never read anywhere in the application.** Every
   availability check — the product page's add-to-cart button, the server-side checkout
   validation, the webhook's inventory decrement — used only the raw `inventory_quantity > 0`
   comparison.

The result: any variant with inventory tracking deliberately disabled in Shopify (which, per
Shopify's own real behavior, means "always purchasable, the recorded quantity is meaningless") was
incorrectly treated as sold out whenever its recorded snapshot quantity happened to be zero or
negative.

## Fix

- **Migration `0008_inventory_tracked.sql`**: added `product_variants.inventory_tracked boolean`.
- **`scripts/shopify/fix-inventory-tracking.ts`**: live, read-only re-pull of `status`,
  `inventoryPolicy`, and `inventoryItem.tracked` for all 376 products / 788 variants directly from
  Shopify's Admin API, backfilled into Supabase. (A first version of this script matched on the
  full Shopify GID and silently updated zero rows, caught and fixed before any data was treated as
  real — see the script's own comments.)
- **`lib/inventory.ts`**: one pure, shared `isVariantAvailable()` function encoding Shopify's real
  rule — not active ⇒ never purchasable; not tracked ⇒ always purchasable regardless of quantity;
  tracked + `CONTINUE` policy ⇒ always purchasable; tracked + `DENY` ⇒ purchasable only while
  quantity covers the requested amount. Used identically everywhere a purchasability decision is
  made:
  - `components/product/product-detail.tsx` (add-to-cart button / "Slut i lager" state)
  - `lib/discounts.ts` (server-side checkout validation — the authoritative check, since it
    re-derives everything from the database and never trusts the client)
  - `app/api/checkout/route.ts` (via `computeCheckoutTotals`)
- **`app/api/webhooks/stripe/route.ts`**: the inventory-decrement step on confirmed payment now
  branches per variant instead of one blanket strict decrement:
  - **untracked** → never touched, at all (new requirement, verified by a real test: a purchase
    of an untracked variant leaves its `inventory_quantity` bit-for-bit unchanged).
  - **tracked + `CONTINUE`** → new `force_decrement_inventory()` RPC (migration
    `0009_force_decrement_inventory_function.sql`), an unconditional decrement that's allowed to
    go negative, matching what "continue selling when out of stock" actually means. (No variant in
    the current catalog uses `CONTINUE` — see below — but the code handles it correctly if one
    ever does.)
  - **tracked + `DENY`** → unchanged: the existing atomic `decrement_inventory()` RPC, which still
    correctly blocks and auto-refunds a genuine oversell.

## Catalog-wide audit results

| | Count |
|---|---|
| Total variants | 788 |
| Tracking **enabled** (`tracked = true`) | 585 |
| Tracking **disabled** (`tracked = false`) | 203 |
| Using policy `CONTINUE` | 0 |
| Using policy `DENY` | 788 |
| Products: active / draft / archived | 323 / 51 / 2 |

**203 untracked variants, 201 of which had a recorded quantity ≤ 0** — these were being
**incorrectly shown as sold out before this fix**, across **95 product listings** spanning **12
distinct product names** (not only the wallets you flagged — "H armband smal" and "H sminkväska"
are untracked too, confirming this was genuinely catalog-wide, not wallet-specific):

| Product | Listings affected | Variants affected |
|---|---|---|
| H armband smal | 41 | 82 |
| Noélle Väska Mini | 5 | 65 |
| Noélle Väska | 7 | 12 |
| Joélle väska | 10 | 10 |
| Kelly Plånbok | 6 | 6 |
| Lady Plånbok | 6 | 6 |
| H sminkväska | 6 | 6 |
| CC Väska | 4 | 4 |
| Lady Väska | 4 | 4 |
| Mimmi Plånbok | 3 | 3 |
| Lilly Väska | 2 | 2 |
| YSL Plånbok | 1 | 1 |

The other 2 untracked variants already had a positive recorded quantity, so their purchasability
didn't change (they were never incorrectly blocked).

**No active product was left incorrectly unavailable.** Exactly one active product, *LV armband*
(`lv-armband-3`), still shows as genuinely sold out after the fix — every one of its variants is
tracked, `DENY`-policy, and at zero quantity. That's correct behavior, not a bug.

**Draft/archived products correctly remain non-purchasable** regardless of their variants'
tracking status — enforced by the explicit product-status check in `lib/discounts.ts`, verified by
a real test (a known draft product's variant is rejected with "inte längre tillgänglig").

## What was deliberately *not* done

- **No inventory quantity was invented or altered** for any untracked variant — their recorded
  numbers (including the negative ones, e.g. YSL Plånbok at −7) are left exactly as extracted.
  They're simply no longer used to gate purchasability for untracked variants, per your explicit
  instruction.
- **No price was changed.**
- Nothing in your Shopify store was touched — this was a read-only re-pull plus a Supabase-side fix.

## Verification

A real, non-synthetic test suite (8 checks, all passing) proved, end-to-end — not just at the
database level:
1. An untracked variant with −7 recorded stock is purchasable at qty 1.
2. The same variant is purchasable at qty 50 (untracked variants have no quantity cap at all).
3. A draft product's variant is rejected.
4–5. Tracked + `DENY` variants with real stock still work, and oversell is still correctly rejected
   (regression check — the existing, already-verified logic for the majority case is untouched).
6. A real Stripe Checkout Session was created for the untracked wallet via the actual
   `/api/checkout` route (never completed).
7–8. The real webhook correctly marked that order paid, and the untracked variant's
   `inventory_quantity` was bit-for-bit unchanged before and after.
