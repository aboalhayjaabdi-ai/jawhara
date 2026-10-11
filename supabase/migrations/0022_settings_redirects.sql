-- Phase 8 (admin completion, part 1): store settings UI backing + DB-driven URL redirects.
-- store_settings already exists (0006) as a flexible key/value table -- no schema change needed,
-- just new keys (business_name, support_email, support_phone, business_address, logo_url),
-- seeded with real current values so the settings page never shows a false-empty state.

insert into store_settings (key, value) values
  ('business_name', '"Jawhara"'),
  ('support_email', '"support@jawhara.se"'),
  ('support_phone', '""'),
  ('business_address', '""'),
  ('logo_url', 'null')
on conflict (key) do nothing;

create table url_redirects (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  destination_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references admin_users (id) on delete set null
);
alter table url_redirects enable row level security;
create policy "public read" on url_redirects for select using (true);
create policy "admin write" on url_redirects for all using (is_admin());
