-- "Passar med" -- manually curated complementary products, distinct from the automatic
-- "Du kanske också gillar" recommendation engine (lib/queries.ts's getRelatedProductCards, which
-- stays untouched). Mirrors collection_products' exact shape: a plain FK join table with an
-- explicit position for admin-controlled drag ordering.
create table product_complementary (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  complementary_product_id uuid not null references products(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_complementary_no_self check (product_id <> complementary_product_id),
  unique (product_id, complementary_product_id)
);
create index product_complementary_product_id_idx on product_complementary (product_id);

alter table product_complementary enable row level security;
create policy "public read" on product_complementary for select using (true);
create policy "admin write" on product_complementary for all using (is_admin());
