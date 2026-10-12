-- Phase 4 of the admin-completion roadmap: migrate lib/pages-content.ts's 7 hardcoded pages
-- (om-oss, aterbetalningspolicy, anvandarvillkor, ringstorlek, startsida, vanliga-fragor,
-- contact) into a real, admin-editable table. Three content shapes exist today (html/faq/
-- contact) -- modeled as one table with type-specific nullable columns rather than three
-- separate tables, since the set of pages is small and every page needs exactly one shape.

create table content_pages (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  type text not null check (type in ('html', 'faq', 'contact')),
  title text not null,
  body_html text,
  faq_items jsonb,
  contact_intro text,
  contact_email_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users (id) on delete set null
);

alter table content_pages enable row level security;
create policy "public read" on content_pages for select using (true);
create policy "admin write" on content_pages for all using (is_admin());
