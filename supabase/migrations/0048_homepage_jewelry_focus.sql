-- Homepage: jewelry first, bags second (2026-11-11).
--
-- Run in Supabase -> SQL Editor (the homepage layout is admin-only data, so it can't be
-- changed by a code deploy). Safe to run again: a second run changes nothing but adds a version. Works on the existing sections in place: nothing is deleted, images
-- and other settings are kept, sections it doesn't recognise are kept (at the end, in their
-- current order). Applies the same change to the admin draft and the published layout, and saves
-- the result as a new version, so the previous layout can be restored from
-- Jawhara admin -> Butik -> Startsida -> versionshistorik.
--
-- New order (visible sections):
--    1. Banner "Black Month"                     (unchanged)
--    2. Rullande text                            (+ "3 FÖR 2 PÅ ALLA SMYCKEN" first)
--    3. 3 för 2 på alla smycken                  (was "Smycken att älska": campaign style, 8 best-selling jewelry)
--    4. Shoppa efter kategori                    (jewelry categories first, then Väskor, Gift sets)
--    5. Black Month – våra bästa erbjudanden     (bags on campaign, unchanged)
--    6. H Armband
--    7. Klöver Armband
--    8. Banner "Maximal glans ..."
--    9. Alla Örhängen
--   10. Guld halsband
--   11. Smycken som du faktiskt gillar
--   12. Bästsäljande väskor                      (was "Våra bästsäljare")
--   13. Noelle mini väskor
--   14. Gift Sets
--   15. Banner "Premiummaterial ..."
-- Hidden (still in the editor, can be switched back on): "Upptäck våra väskor", "Nyheter",
-- "Alla produkter" -- they repeated bags already shown higher up.
-- Every product list below the first one skips products already shown above it ("unique"), so the
-- same product isn't repeated on the page.

begin;

create or replace function pg_temp.jawhara_jewelry_first(secs jsonb) returns jsonb
language sql as $fn$
  with src as (
    select e.value as s, e.ordinality as idx,
           lower(trim(coalesce(e.value->'config'->>'heading', e.value->'config'->>'text', e.value->'config'->>'topText', ''))) as h,
           e.value->>'type' as t,
           coalesce((e.value->>'visible')::boolean, true) as vis
    from jsonb_array_elements(secs) with ordinality e
  ),
  ranked as (
    select *, case when t = 'hero' and vis then row_number() over (partition by (t = 'hero' and vis) order by idx) end as hero_n
    from src
  ),
  keyed as (
    select idx,
      case
        when not vis then 1000 + idx
        when t = 'hero' and h like 'maximal glans%' then 80
        when t = 'hero' and h like 'premiummaterial%' then 150
        when t = 'hero' and hero_n = 1 then 10
        when t = 'marquee' then 20
        when h in ('smycken att älska', '3 för 2 på alla smycken') then 30
        when h = 'shoppa efter kategori' then 40
        when h like 'black month%erbjudanden' then 50
        when h = 'h armband' then 60
        when h = 'klöver armband' then 70
        when h = 'alla örhängen' then 90
        when h = 'guld halsband' then 100
        when h like 'smycken som du faktiskt gillar%' then 110
        when h in ('våra bästsäljare', 'bästsäljande väskor') then 120
        when h = 'noelle mini väskor' then 130
        when h = 'gift sets' then 140
        else 500 + idx -- unrecognised / now-hidden sections keep their relative order
      end as k,
      case
        when not vis then s
        when t = 'marquee' and jsonb_typeof(s->'config'->'items') = 'array'
             and not (s->'config'->'items') ? '3 FÖR 2 PÅ ALLA SMYCKEN'
          then jsonb_set(s, '{config,items}', '["3 FÖR 2 PÅ ALLA SMYCKEN"]'::jsonb || (s->'config'->'items'))
        when h = 'smycken att älska'
          then jsonb_set(s, '{config}', (s->'config') || jsonb_build_object(
                 'heading', '3 för 2 på alla smycken',
                 'intro', 'Köp 3 smycken och få det billigaste på köpet. Rabatten dras automatiskt i varukorgen.',
                 'style', 'campaign',
                 'layout', 'grid',
                 'limit', 8,
                 'sort', 'best-selling',
                 'collectionHandle', 'alla-smycken',
                 'buttonText', 'Shoppa smycken',
                 'buttonHref', '/collections/alla-smycken'))
        when h = 'shoppa efter kategori'
          then jsonb_set(s, '{config,handles}', '["armband","halsband","orhangen","ringar","vaskor-och-tillbehor","gift-sets"]'::jsonb)
        when h = 'våra bästsäljare'
          then jsonb_set(s, '{config}', (s->'config') || '{"heading":"Bästsäljande väskor","unique":true}'::jsonb)
        when h in ('upptäck våra väskor', 'nyheter', 'alla produkter')
          then s || '{"visible":false}'::jsonb
        when h = '3 för 2 på alla smycken' then s -- already converted (re-run)
        when t = 'product_list'
          then jsonb_set(s, '{config,unique}', 'true'::jsonb)
        else s
      end as s2
    from ranked
  )
  select coalesce(jsonb_agg(s2 order by k, idx), '[]'::jsonb) from keyed;
$fn$;

-- Safety: the same number of sections before and after, or nothing is changed.
do $$
declare r record;
begin
  for r in select id, sections from storefront_layouts where page = 'home' loop
    if jsonb_array_length(pg_temp.jawhara_jewelry_first(r.sections)) <> jsonb_array_length(r.sections) then
      raise exception 'Section count changed for layout % -- aborting', r.id;
    end if;
  end loop;
end $$;

update storefront_layouts
set sections = pg_temp.jawhara_jewelry_first(sections), updated_at = now()
where page = 'home';

insert into storefront_layout_versions (page, version, sections, note)
select 'home', coalesce((select max(version) from storefront_layout_versions where page = 'home'), 0) + 1, sections, 'Smycken först (3 för 2), väskor sekundärt'
from storefront_layouts where page = 'home' and status = 'published';

commit;

-- Result: the published homepage, top to bottom.
select ord, s->>'type' as type, coalesce((s->>'visible')::boolean, true) as visible,
       coalesce(s->'config'->>'heading', s->'config'->>'topText', s->'config'->>'buttonText', '') as heading
from storefront_layouts, jsonb_array_elements(sections) with ordinality as e(s, ord)
where page = 'home' and status = 'published'
order by ord;
