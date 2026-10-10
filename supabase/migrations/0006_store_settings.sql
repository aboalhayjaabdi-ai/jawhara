-- Makes VAT (and any future global checkout setting) a real, changeable value instead of a
-- hardcoded literal in application code. Seeded at 0% -- carrying forward the explicit user
-- decision made 2026-10-10 (no reliable per-product tax rate exists in the real Shopify data:
-- only a binary `taxable` flag, inconsistently used in only 42/788 variants and 2/286 orders) --
-- as the *default*, not re-deciding the value. Changeable via one SQL statement until Phase 6's
-- admin UI exists.

create table store_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into store_settings (key, value) values ('vat_rate_percent', '0');

alter table store_settings enable row level security;
create policy "public read" on store_settings for select using (true);
create policy "admin write" on store_settings for all using (is_admin());
