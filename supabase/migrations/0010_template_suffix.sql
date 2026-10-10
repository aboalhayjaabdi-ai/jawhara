-- Real Shopify template assignment data, never captured in the original Phase 2 extraction
-- (same gap class as inventoryItem.tracked) -- backfilled from a live, read-only re-pull.
-- Drives the category-specific product template system and the collection subcategory tile
-- restoration (both keyed off the real templateSuffix Shopify assigned, not guessed from
-- collection membership or filename similarity).
alter table products add column if not exists template_suffix text;
alter table collections add column if not exists template_suffix text;
