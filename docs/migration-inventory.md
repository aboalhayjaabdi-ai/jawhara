# Jawhara — Shopify Migration Inventory

Generated from a live, read-only Admin GraphQL audit of `1tq41d-4y.myshopify.com` (jawhara.se) on
2026-10-08. Source script: `scripts/shopify/audit.ts` → raw output in `data/exports/audit-raw.json`
(gitignored — contains no PII itself, but kept local as a matter of policy for anything pulled
from the live store).

## Store

| Field | Value |
|---|---|
| Shop name | JAWHARA |
| Primary domain | jawhara.se |
| Plan | Basic |
| Currency | SEK |
| Timezone | Europe/Stockholm |
| Markets enabled | Sweden (SE), Denmark (DK) |
| Locations | 1 — "Shop location" (SE) |

## Record counts (exact, via Shopify's count APIs)

| Resource | Count |
|---|---|
| Products | 376 |
| Collections | 31 |
| Customers | 504 |
| Orders | 286 |
| Pages | 8 |
| Blogs | 1 (0 articles) |
| Menus | 2 (Main menu, Footer menu) |
| Locations | 1 |
| Markets | 2 |
| Metaobject definitions | 0 (none defined — no custom structured content via metaobjects) |

Discounts were sampled, not yet counted exactly (see Phase 2 extraction task) — sample shows a mix
of automatic BXGY (buy-X-get-Y) promotions and discount codes (one active: `RABATT20F`; others
expired).

## Theme

**14 themes exist in the store's theme library; only one is published (role `MAIN`):**

- **Live theme: "Jawhara 3.0"** (`gid://shopify/OnlineStoreTheme/205514506578`) — a customized
  descendant of Shopify's Atelier base theme. Lineage visible in the theme list: Atelier → Updated
  copy of Atelier → Jawhara 2.0 → **Jawhara 3.0 (live)**.
- Also present: the original unmodified "Atelier" theme, plus several of Shopify's free themes
  (Dawn, Origin, Sense, Craft, Trade, Dwell, Fabric, Tinker) — these appear to be leftover
  defaults/experiments, not in active use.
- All 14 themes are pulled from Admin API for structural reference in Phase 2; **"Jawhara 3.0" is
  the one whose Liquid templates/sections/CSS actually matter** as a design reference, since it's
  what customers who reach the storefront would currently see.
- A published ("MAIN") theme existing confirms the storefront being inaccessible is **not** caused
  by a missing/unpublished theme — the cause is elsewhere (custom domain config, store password,
  sales channel state) and doesn't block this migration either way.

## Third-party apps detected (via product metafield namespaces)

Found by inspecting live product metafields — **these apps' functionality is not natively
migratable and needs a native replacement built in the new platform**:

- **Judge.me** (`judgeme` namespace) — product reviews. Metafields contain full review content:
  reviewer name, rating, body text, timestamps, verified-buyer flag, plus pre-rendered HTML widgets
  and JSON-LD. The underlying review *data* is extractable and should be migrated into a native
  reviews table (Phase 3); the HTML/JS widget itself will be rebuilt as a storefront component
  (Phase 4), not ported.
- **Pennywise** (`pennywise` namespace) — volume/bundle pricing ("2 för 299:-" style quantity
  discounts), stored per-product as JSON config. This logic needs to be reimplemented as part of
  the native discount engine (Phase 5) rather than migrated as-is, since it's app-specific
  behavior, not a Shopify-native discount type.
- Scope was not requested for `read_online_store_pages`'s app-embed/script-tag equivalents or
  `read_checkouts`, so any checkout-stage app customizations (if present) weren't visible in this
  audit — flagged for Phase 2 follow-up if discovered.

## Pages (8)

Kontakta oss (contact), Om oss (about), Köpvillkor (terms/returns), Integritetspolicy (privacy
policy), Startsida (homepage content block), Ringstorlek (ring sizing guide), a dedicated landing
page ("JAWHARA — Luxury Jewelry Landing Page"), Vanliga frågor (FAQ). All in Swedish — confirms the
storefront is Swedish-first; content and SEO work in Phase 4 should preserve Swedish as primary
with the existing URL handles as the redirect-map baseline.

## Navigation

Two menus: **Main menu** (Hem, Alla smycken, Armband, Halsband, Ringar, Örhängen, Väskor,
Tillbehör — i.e. Home, All jewelry, Bracelets, Necklaces, Rings, Earrings, Bags, Accessories) and
**Footer menu**. Structure maps cleanly onto standard collection-based navigation for Phase 4.

## Products & variants (sample-verified structure)

376 products confirmed. Sampled products show: multi-variant structure (size/length variants),
SKUs, per-variant inventory quantities, multiple images per product, `vendor` field in use
("925 STERLING SILVER" etc.), empty `productType` on sampled items (worth checking consistency
across the full catalog during Phase 2 extraction). Products carry rich metafield data (reviews,
bundle-discount config — see Apps section above) that must be extracted alongside core product
fields, not just the core Admin API product schema.

## Customers & orders

504 customers, 286 orders. Orders include financial/fulfillment status, line totals in SEK.
Customer `state` field in the sample was consistently `DISABLED` (Shopify's flag for
accounts without password-based login enabled — expected for a store primarily using guest/
express checkout; does not indicate inactive customers). Full order line-item detail,
shipping/billing addresses, and payment gateway references are deferred to the Phase 2 extraction
(not pulled in this count/structure-only audit pass).

## Not yet checked / deferred to Phase 2

- Full collection list beyond the 10-item sample (31 total — smart vs. custom rule breakdown).
- Exact discount/price-rule count and full configuration of each.
- Shop legal policies (terms of service, refund policy, privacy policy as Shopify-native policy
  objects) — requires the `read_legal_policies` scope, which wasn't requested; either add the scope
  or treat the Pages content above as the source of truth (Köpvillkor/Integritetspolicy pages look
  like the actual customer-facing policy text already).
- Full customer address book, marketing consent state (needed for GDPR-compliant migration).
- Translations/localized content (`markets` shows Sweden + Denmark — check whether Danish
  translations exist and are in active use).
- Full media/image inventory and total storage size (needed to plan the Supabase Storage
  migration).
