-- Jawhara initial schema.
-- Shopify's original record ID is kept directly on each row as `shopify_id`
-- (unique, nullable) rather than in separate mapping tables -- simpler to
-- query/join while still fully traceable back to the source record.
-- No Pennywise-derived table or column exists anywhere here, per explicit
-- user instruction (see docs/risk-register.md §1b).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------

create table locations (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  name text not null,
  is_active boolean not null default true,
  city text,
  country_code text,
  created_at timestamptz not null default now()
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  title text not null,
  handle text not null unique,
  description_html text,
  sort_order text,
  image_url text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  title text not null,
  handle text not null unique,
  status text not null default 'active',
  product_type text,
  vendor text,
  description_html text,
  tags text[] not null default '{}',
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_idx on products (status);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  product_id uuid not null references products (id) on delete cascade,
  title text not null,
  sku text,
  barcode text,
  price numeric(10, 2) not null,
  compare_at_price numeric(10, 2),
  inventory_quantity integer not null default 0,
  inventory_policy text,
  taxable boolean not null default true,
  option1 text,
  option2 text,
  option3 text,
  created_at timestamptz not null default now()
);
create index product_variants_product_id_idx on product_variants (product_id);

create table media (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  product_id uuid references products (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete set null,
  storage_path text not null,
  alt_text text,
  width integer,
  height integer,
  "position" integer not null default 0,
  created_at timestamptz not null default now()
);
create index media_product_id_idx on media (product_id);

create table collection_products (
  collection_id uuid not null references collections (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  "position" integer not null default 0,
  primary key (collection_id, product_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  source_review_id text unique,
  product_id uuid not null references products (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  author_name text,
  body text,
  verified_buyer boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_product_id_idx on reviews (product_id);

-- Shopify-native discounts only (Pennywise excluded entirely)
create table discounts (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  title text,
  kind text not null,
  code text,
  status text not null default 'active',
  value_type text,
  value numeric(10, 2),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Basic visual storefront editor content (homepage sections)
create table storefront_sections (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  "position" integer not null default 0,
  is_visible boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Customers, orders, commerce
-- ---------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  auth_user_id uuid references auth.users (id) on delete set null,
  email text,
  first_name text,
  last_name text,
  phone text,
  accepts_marketing boolean not null default false,
  marketing_consent_updated_at timestamptz,
  note text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_auth_user_id_idx on customers (auth_user_id);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  customer_id uuid references customers (id) on delete cascade,
  first_name text,
  last_name text,
  company text,
  address1 text,
  address2 text,
  city text,
  province text,
  province_code text,
  zip text,
  country text,
  country_code text,
  phone text,
  is_default boolean not null default false
);
create index addresses_customer_id_idx on addresses (customer_id);

create table carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers (id) on delete set null,
  session_token text unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  variant_id uuid not null references product_variants (id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index cart_items_cart_id_idx on cart_items (cart_id);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  customer_id uuid references customers (id) on delete set null,
  order_number text not null,
  email text,
  phone text,
  currency_code text not null default 'SEK',
  financial_status text,
  fulfillment_status text,
  subtotal_price numeric(10, 2),
  total_shipping numeric(10, 2),
  total_tax numeric(10, 2),
  total_discounts numeric(10, 2),
  total_price numeric(10, 2) not null,
  note text,
  tags text[] not null default '{}',
  cancelled_at timestamptz,
  cancel_reason text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_customer_id_idx on orders (customer_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  order_id uuid not null references orders (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  title text not null,
  sku text,
  quantity integer not null,
  unit_price numeric(10, 2) not null,
  discounted_unit_price numeric(10, 2)
);
create index order_items_order_id_idx on order_items (order_id);

create table inventory_levels (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  available integer not null default 0,
  unique (variant_id, location_id)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  order_id uuid not null references orders (id) on delete cascade,
  kind text,
  status text,
  gateway text,
  amount numeric(10, 2),
  currency_code text,
  processed_at timestamptz,
  stripe_payment_intent_id text
);
create index payments_order_id_idx on payments (order_id);

create table fulfillments (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  order_id uuid not null references orders (id) on delete cascade,
  status text,
  tracking_number text,
  tracking_url text,
  tracking_company text,
  created_at timestamptz not null default now()
);

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  status text not null default 'requested',
  reason text,
  created_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  shopify_id text unique,
  order_id uuid not null references orders (id) on delete cascade,
  return_id uuid references returns (id) on delete set null,
  amount numeric(10, 2) not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Admin / audit
-- ---------------------------------------------------------------------

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references admin_users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admin_users where auth_user_id = auth.uid());
$$;

alter table locations enable row level security;
alter table collections enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table media enable row level security;
alter table collection_products enable row level security;
alter table reviews enable row level security;
alter table discounts enable row level security;
alter table storefront_sections enable row level security;
alter table customers enable row level security;
alter table addresses enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table inventory_levels enable row level security;
alter table payments enable row level security;
alter table fulfillments enable row level security;
alter table returns enable row level security;
alter table refunds enable row level security;
alter table admin_users enable row level security;
alter table audit_log enable row level security;

-- Public read access: catalog content anyone can browse on the storefront.
create policy "public read" on locations for select using (true);
create policy "public read" on collections for select using (true);
create policy "public read" on products for select using (status = 'active' or is_admin());
create policy "public read" on product_variants for select using (true);
create policy "public read" on media for select using (true);
create policy "public read" on collection_products for select using (true);
create policy "public read" on reviews for select using (true);
create policy "public read" on discounts for select using (status = 'active' or is_admin());
create policy "public read" on inventory_levels for select using (true);
create policy "public read" on storefront_sections for select using (is_visible or is_admin());

-- Customers: only their own row (or admin).
create policy "own row" on customers for select using (auth_user_id = auth.uid() or is_admin());
create policy "own row update" on customers for update using (auth_user_id = auth.uid() or is_admin());

create policy "own addresses" on addresses for select
  using (is_admin() or customer_id in (select id from customers where auth_user_id = auth.uid()));
create policy "own addresses write" on addresses for all
  using (is_admin() or customer_id in (select id from customers where auth_user_id = auth.uid()));

create policy "own orders" on orders for select
  using (is_admin() or customer_id in (select id from customers where auth_user_id = auth.uid()));

create policy "own order items" on order_items for select
  using (is_admin() or order_id in (
    select o.id from orders o join customers c on c.id = o.customer_id where c.auth_user_id = auth.uid()
  ));

create policy "own carts" on carts for all
  using (is_admin() or customer_id in (select id from customers where auth_user_id = auth.uid()));
create policy "own cart items" on cart_items for all
  using (is_admin() or cart_id in (
    select ca.id from carts ca join customers c on c.id = ca.customer_id where c.auth_user_id = auth.uid()
  ));

-- Sensitive operational data: admin only (service_role bypasses RLS for backend jobs).
create policy "admin only" on payments for all using (is_admin());
create policy "admin only" on fulfillments for all using (is_admin());
create policy "admin only" on returns for all using (is_admin());
create policy "admin only" on refunds for all using (is_admin());
create policy "admin only" on admin_users for all using (is_admin());
create policy "admin only" on audit_log for all using (is_admin());

-- Admin write access on catalog/content tables (reads are covered by the public policies above).
create policy "admin write" on locations for all using (is_admin());
create policy "admin write" on collections for all using (is_admin());
create policy "admin write" on products for all using (is_admin());
create policy "admin write" on product_variants for all using (is_admin());
create policy "admin write" on media for all using (is_admin());
create policy "admin write" on collection_products for all using (is_admin());
create policy "admin write" on discounts for all using (is_admin());
create policy "admin write" on storefront_sections for all using (is_admin());
create policy "admin write" on inventory_levels for all using (is_admin());
