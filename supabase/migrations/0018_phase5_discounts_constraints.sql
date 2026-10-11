-- Phase 5: light hardening only -- every column the discounts admin UI needs already exists
-- (buy/get item type+ids, combines_with_*, usage limits, scheduling dates), confirmed by reading
-- the real 6 rows live in the database before writing this migration. `kind` and `status` were
-- plain unconstrained text; both real value sets ('automatic'|'code' and 'active'|'expired') are
-- confirmed safe to constrain. 'scheduled' and 'draft' are added now for the new admin UI's
-- scheduling feature (lib/admin/discount-scheduler.ts keeps status in sync with starts_at/ends_at
-- -- lib/discounts.ts itself is untouched, it only ever reads status='active', exactly as before).
alter table discounts add constraint discounts_kind_check check (kind in ('automatic', 'code'));
alter table discounts add constraint discounts_status_check check (status in ('draft', 'scheduled', 'active', 'expired'));
