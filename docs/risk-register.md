# Jawhara — Migration Risk Register

Compiled from the Phase 1 live-store audit (`docs/migration-inventory.md`). Each item: risk,
impact, mitigation.

## 1. Atelier theme licensing

**Risk:** The live theme ("Jawhara 3.0") is a customized descendant of Shopify's paid Atelier
theme. Atelier's Liquid/CSS source is commercially licensed, not owned outright by Jawhara.
**Impact:** Porting the theme's source code (Liquid templates, CSS, JS) directly into the new
Next.js platform could violate the theme license.
**Mitigation:** Treat the live theme as a **visual/UX reference only**. Pull its files via the
Admin API for design analysis (layout, section structure, content hierarchy) but rebuild all
storefront UI from scratch in Next.js/Tailwind/shadcn. Before Phase 4 begins, locate the original
Atelier purchase/license terms (check the Shopify Theme Store purchase history or the merchant's
receipts) to confirm what's explicitly permitted — this task is blocked on the user providing that
confirmation, not on technical access.

## 2. Third-party app functionality has no native equivalent

**Risk:** Judge.me (reviews) and Pennywise (volume/bundle discounts) provide functionality
currently live on the storefront via app embeds/metafields, not Shopify-native features.
**Impact:** Migrating only "Shopify data" would silently drop reviews display and bundle pricing
behavior.
**Mitigation:** Review *data* (ratings, text, reviewer name, timestamps, verified-buyer flag) is
extractable from product metafields and will be migrated into a native `reviews` table (Phase 3)
with a rebuilt display component (Phase 4). Bundle/volume discount *logic* will be reimplemented
server-side in the new discount engine (Phase 5) using the same quantity/percentage rules found in
the `pennywise` metafield JSON as a spec, not ported as code.

## 3. GDPR exposure on customer data migration

**Risk:** 504 customer records with Swedish/EU customers will be migrated into a new system.
**Impact:** Mishandling personal data (no lawful basis documented, missing consent records, no
data-subject-request process) creates real regulatory exposure under GDPR.
**Mitigation:** Phase 2 extraction must capture marketing-consent state alongside each customer
record (not just profile data) so the new platform only sends marketing communications to
customers who already consented. Phase 3 RLS policies must restrict customer PII to the owning
customer and admin roles only. Before Phase 9 launch, confirm a documented lawful basis (contract
performance for order history; consent for marketing) and that data-subject access/deletion is
supported by the admin dashboard (Phase 6).

## 4. Payment data — nothing to migrate, by design

**Risk:** None, flagged for clarity. Shopify never exposes raw card numbers via the Admin API
(PCI scope stays with the payment processor). **No mitigation needed** — Stripe becomes the new
PCI-compliant payment path from a clean slate; historical order *totals/status* migrate, card data
does not and should not.

## 5. Scope gaps found during the audit

**Risk:** Two things weren't visible with current read scopes:
- `shopPolicies` (Terms of Service, Refund Policy, Privacy Policy as Shopify-native policy
  objects) requires `read_legal_policies`, which wasn't requested.
- Exact discount/price-rule totals and full configuration weren't pulled yet (sample only).
**Impact:** Low — the equivalent policy text is very likely already covered by the Pages inventory
(Köpvillkor = terms/refund, Integritetspolicy = privacy policy), so this may be redundant rather
than missing. Discounts are a Phase 2 extraction task, not a blocker.
**Mitigation:** If `shopPolicies` content turns out to differ from the Pages content, add
`read_legal_policies` to the app's scopes (no reinstall needed — same client-credentials flow
picks up new scopes once granted) and re-pull. Otherwise, use the existing Pages content as source
of truth.

## 6. Admin API rate limits on bulk extraction

**Risk:** 376 products (with variants/images/metafields), 504 customers, 286 orders is a moderate
dataset — well within what paginated GraphQL calls can handle, but metafield-heavy products (see
Judge.me JSON blobs, which are large) increase per-request query cost.
**Impact:** Low for this store's size, but Phase 2 scripts should still use GraphQL Bulk
Operations for the products and orders exports specifically (not plain pagination) to avoid
throttling and to get a clean, resumable single export file per resource.
**Mitigation:** Already designed into Phase 2 of the migration plan; `scripts/shopify/client.ts`
already retries once on `THROTTLED` errors as a baseline safeguard.

## 7. Closed storefront is not a theme/data problem

**Finding (not a risk):** A `MAIN` (published) theme exists ("Jawhara 3.0"), so the storefront
being inaccessible to visitors is caused by something else — custom domain/DNS, a store password,
or a disabled sales channel — not missing theme or product data. This doesn't block any part of
the migration (everything needed comes from the Admin API regardless), but it's worth the user
checking independently if regaining the live storefront matters before cutover.

## 8. Data not yet captured (tracked, not blocking)

Full collection rule configuration, exact discount/price-rule set, full customer address books and
consent flags, translations for the Denmark market, and total media storage footprint are deferred
to Phase 2 extraction scripts rather than this inventory pass. None of these are access
problems — same credentials, just a bigger pull. Tracked as Phase 2 scope, not a new risk.
