-- Phase 7: visual storefront editor. Draft/published homepage layouts with version history, plus
-- real DB-backed menus (replacing the hardcoded NAV_ITEMS/FOOTER_LINKS/etc. arrays). The existing
-- `storefront_sections` table (dead code, zero reads/writes anywhere) is deliberately left
-- untouched -- it has no draft/published split and no version history, both required here.

create table storefront_layouts (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  status text not null check (status in ('draft', 'published')),
  sections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users (id) on delete set null,
  unique (page, status)
);

create table storefront_layout_versions (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'home',
  version integer not null,
  sections jsonb not null,
  note text,
  published_at timestamptz not null default now(),
  published_by uuid references admin_users (id) on delete set null,
  unique (page, version)
);

create table storefront_menus (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (handle in ('main-menu', 'footer', 'about', 'terms', 'social')),
  label text not null
);

create table storefront_menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references storefront_menus (id) on delete cascade,
  title text not null,
  href text not null,
  "position" integer not null default 0
);
create index storefront_menu_items_menu_id_idx on storefront_menu_items (menu_id, "position");

alter table storefront_layouts enable row level security;
alter table storefront_layout_versions enable row level security;
alter table storefront_menus enable row level security;
alter table storefront_menu_items enable row level security;

-- Public read only ever sees the published layout/versions -- mirrors the existing
-- `products.status = 'active' or is_admin()` pattern exactly. Drafts are never public.
create policy "public read" on storefront_layouts for select using (status = 'published' or is_admin());
create policy "admin write" on storefront_layouts for all using (is_admin());

create policy "admin only" on storefront_layout_versions for all using (is_admin());

create policy "public read" on storefront_menus for select using (true);
create policy "admin write" on storefront_menus for all using (is_admin());
create policy "public read" on storefront_menu_items for select using (true);
create policy "admin write" on storefront_menu_items for all using (is_admin());
