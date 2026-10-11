-- Phase 3: product/variant/collection/inventory management. Schema only -- the one-time data
-- backfill (product_templates content, collection_tile_items seed, collections.image_url backfill)
-- runs as a separate TS script (scripts/supabase/backfill-product-templates.ts) that imports the
-- real objects directly from lib/product-templates.ts / lib/collection-tiles.ts, rather than
-- hand-transcribing rich Swedish/HTML text into SQL literals -- a strictly stronger verbatim-copy
-- guarantee than manual SQL authoring (zero transcription risk).

-- product_variants: weight, informational only (no requires_shipping -- shipping is already a
-- hardcoded store-wide free constant with no per-item logic to wire it into).
alter table product_variants add column weight numeric(10, 3);
alter table product_variants add column weight_unit text not null default 'kg' check (weight_unit in ('g', 'kg'));

-- products/collections: origin label, mirrors orders.source from migration 0012.
alter table products add column source text;
update products set source = case when shopify_id is not null then 'shopify' else 'manual' end;
alter table products alter column source set not null;
alter table products add constraint products_source_check check (source in ('shopify', 'manual'));

alter table collections add column source text;
update collections set source = case when shopify_id is not null then 'shopify' else 'manual' end;
alter table collections alter column source set not null;
alter table collections add constraint collections_source_check check (source in ('shopify', 'manual'));

-- Inventory movement ledger -- genuine per-unit stock history, distinct from the generic audit_log.
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'sale', 'cancellation', 'return_restock', 'manual_adjustment',
    'received_stock', 'damaged', 'correction', 'initial_import'
  )),
  note text,
  resulting_quantity integer not null,
  order_id uuid references orders (id) on delete set null,
  actor_id uuid references admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_id_idx on inventory_movements (variant_id, created_at desc);
create index inventory_movements_created_at_idx on inventory_movements (created_at desc);
alter table inventory_movements enable row level security;
create policy "admin only" on inventory_movements for all using (is_admin());

-- product_templates: DB-backed replacement for lib/product-templates.ts's static Record. `key` is a
-- soft string join (not a hard FK) against products.template_suffix/collections.template_suffix --
-- preserves today's exact silent-null-on-no-match lookup behavior; a hard FK would fail the
-- migration outright if any pre-existing template_suffix value doesn't match one of the 8 known keys.
create table product_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  intro_paragraph text,
  trust_lines text[],
  usp_block jsonb,
  faq jsonb,
  description_heading text not null default 'Specifikationer',
  accordion_rows jsonb not null default '[]'::jsonb,
  size_guide_href text,
  offer_message jsonb,
  show_inventory_status boolean not null default true,
  gallery_layout text not null default 'grid' check (gallery_layout in ('carousel', 'grid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table product_templates enable row level security;
create policy "public read" on product_templates for select using (true);
create policy "admin write" on product_templates for all using (is_admin());

-- collection_tile_items: DB-backed replacement for COLLECTION_TILE_GROUPS. Keyed by template_suffix
-- (a template, not one specific collection row -- any collection using template X shows the same
-- tile row, matching today's real lookup), pointing at the child collection by real FK id instead
-- of a hardcoded handle string -- robust against a future handle rename.
create table collection_tile_items (
  id uuid primary key default gen_random_uuid(),
  template_suffix text not null,
  child_collection_id uuid not null references collections (id) on delete cascade,
  "position" integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_suffix, child_collection_id)
);
create index collection_tile_items_template_suffix_idx on collection_tile_items (template_suffix);
alter table collection_tile_items enable row level security;
create policy "public read" on collection_tile_items for select using (true);
create policy "admin write" on collection_tile_items for all using (is_admin());

-- Extend the two existing inventory RPCs (0005/0009) with trailing DEFAULT params so every existing
-- caller (the Stripe webhook's own inline calls, lib/inventory/consume.ts, lib/inventory/restock.ts)
-- keeps working with zero code changes, while any call site that DOES pass the new args gets ledger
-- coverage automatically. Core locking/update logic copied verbatim from 0005/0009 -- only the
-- ledger insert is new.
create or replace function decrement_inventory(
  p_variant_id uuid, p_qty integer,
  p_reason text default 'sale', p_order_id uuid default null, p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  affected integer;
  v_new_qty integer;
begin
  update product_variants
  set inventory_quantity = inventory_quantity - p_qty
  where id = p_variant_id and inventory_quantity >= p_qty
  returning inventory_quantity into v_new_qty;
  get diagnostics affected = row_count;
  if affected > 0 then
    insert into inventory_movements (variant_id, delta, reason, resulting_quantity, order_id, actor_id)
    values (p_variant_id, -p_qty, p_reason, v_new_qty, p_order_id, p_actor_id);
  end if;
  return affected > 0;
end;
$$;

create or replace function force_decrement_inventory(
  p_variant_id uuid, p_qty integer,
  p_reason text default 'manual_adjustment', p_order_id uuid default null, p_actor_id uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_new_qty integer;
begin
  update product_variants
  set inventory_quantity = inventory_quantity - p_qty
  where id = p_variant_id
  returning inventory_quantity into v_new_qty;
  insert into inventory_movements (variant_id, delta, reason, resulting_quantity, order_id, actor_id)
  values (p_variant_id, -p_qty, p_reason, v_new_qty, p_order_id, p_actor_id);
end;
$$;
