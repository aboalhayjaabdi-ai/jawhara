-- Phase 7 seed: the exact, verbatim 16 current homepage sections (read directly from
-- app/(storefront)/page.tsx) as both the draft and published `storefront_layouts` rows, plus
-- version 1 as the baseline snapshot -- so cutover to the DB-driven homepage changes nothing
-- visually until an admin makes an edit. Also seeds the 5 real menus/items read directly from
-- components/layout/header.tsx and footer.tsx, replacing their hardcoded arrays.

insert into storefront_layouts (page, status, sections) values (
  'home',
  'published',
  '[
    {"id":"12ada0d9-86e4-4cd5-8cd5-471a99f46064","type":"hero","visible":true,"config":{"variant":"centered-cta","desktopImage":"/brand/hero1-desktop.png","mobileImage":"/brand/hero1-mobile.png","buttonText":"UTFORSKA NU","buttonHref":"/collections/alla-smycken","height":"100vh"}},
    {"id":"27acaba3-40be-43e8-85c7-e1a1850011d1","type":"marquee","visible":true,"config":{"items":["KLARNA","14 DAGARS ÖPPET KÖP","FRI FRAKT"]}},
    {"id":"a218f197-5b37-42cd-b907-b4c6e5afce45","type":"product_list","visible":true,"config":{"collectionHandle":"h-armband","heading":"H Armband","limit":7,"layout":"carousel"}},
    {"id":"f2e52bed-3c68-4f11-9b05-6847ea1b2ae4","type":"product_list","visible":true,"config":{"collectionHandle":"klover-armband-1","heading":"Klöver Armband","limit":7,"layout":"carousel"}},
    {"id":"e90e0795-ee06-475b-951e-3d317d4fd361","type":"product_list","visible":true,"config":{"collectionHandle":"noelle-mini-vaskor","heading":"Noelle mini väskor","limit":6,"layout":"carousel"}},
    {"id":"68f38182-a9ba-4b86-9764-b788fec1285b","type":"text","visible":true,"config":{"text":"Utforska våra kollektioner"}},
    {"id":"7baca4d4-c0b8-434a-98ab-ea027630dc9b","type":"collection_links","visible":true,"config":{"handles":["armband","halsband","ringar","orhangen"]}},
    {"id":"6aab82aa-f64a-4a0e-ae49-642b6ddc3005","type":"product_list","visible":true,"config":{"collectionHandle":"bastsaljare-1","heading":"Bästsäljare","limit":4,"layout":"grid"}},
    {"id":"66c814b7-dda6-4b69-87d7-f0135314f463","type":"product_list","visible":true,"config":{"collectionHandle":"vaskor-och-tillbehor","heading":"Väskor","limit":4,"layout":"grid","buttonText":"Se alla"}},
    {"id":"05b98413-cd19-459a-b52a-1e20bfb2ae6b","type":"featured_product","visible":true,"config":{"handle":"rh-skal"}},
    {"id":"ab277656-9bc5-450a-9bdd-ee4d8077be42","type":"product_list","visible":true,"config":{"collectionHandle":"all","heading":"Alla produkter","limit":4,"layout":"grid"}},
    {"id":"6f178d5f-fe0c-458a-8889-c3798887ccc3","type":"hero","visible":true,"config":{"variant":"split-bottom","desktopImage":"/brand/hero2-desktop.png","mobileImage":"/brand/hero2-mobile.png","buttonText":"Handla nu","buttonHref":"/collections/all","heading":"Premiummaterial och\nnoggrant utvalda detaljer","height":"720px"}},
    {"id":"bc2f1bde-2af7-4abd-852b-14b2638798f9","type":"product_list","visible":true,"config":{"collectionHandle":"orhangen-copy","heading":"Alla Örhängen","limit":6,"layout":"carousel"}},
    {"id":"a8a1d29f-5cf7-408c-847c-58c9f795135b","type":"comparison_slider","visible":true,"config":{"beforeImage":"/brand/comparison-before.png","afterImage":"/brand/comparison-after.png","heading":"Smycken som du faktiskt gillar","buttonText":"KÖP NU","buttonHref":"/collections/all"}},
    {"id":"6a188448-224e-4afa-bbca-7416ef3017f5","type":"product_list","visible":true,"config":{"collectionHandle":"guld-halsband","heading":"Guld halsband","limit":6,"layout":"carousel"}},
    {"id":"3a4dde8b-2bf0-403b-8aac-3e24f41de9a3","type":"hero","visible":true,"config":{"variant":"split-bottom","desktopImage":"/brand/hero3-desktop.png","mobileImage":"/brand/hero3-mobile.png","buttonText":"Handla nu","buttonHref":"/collections/all","heading":"Maximal glans och design\nsom drar blickarna till sig","height":"720px"}}
  ]'::jsonb
);

insert into storefront_layouts (page, status, sections)
  select 'home', 'draft', sections from storefront_layouts where page = 'home' and status = 'published';

insert into storefront_layout_versions (page, version, sections, note)
  select 'home', 1, sections, 'Ursprunglig version (migrerad från hårdkodad startsida)'
  from storefront_layouts where page = 'home' and status = 'published';

insert into storefront_menus (handle, label) values
  ('main-menu', 'Huvudmeny'),
  ('footer', 'Hjälp'),
  ('about', 'Om Jawhara'),
  ('terms', 'Villkor'),
  ('social', 'Följ oss');

insert into storefront_menu_items (menu_id, title, href, "position")
  select id, item.title, item.href, item.pos
  from storefront_menus,
    jsonb_to_recordset(
      (case handle
        when 'main-menu' then '[
          {"title":"Hem","href":"/","pos":0},
          {"title":"Alla smycken","href":"/collections/alla-smycken","pos":1},
          {"title":"Armband","href":"/collections/armband","pos":2},
          {"title":"Halsband","href":"/collections/halsband","pos":3},
          {"title":"Ringar","href":"/collections/ringar","pos":4},
          {"title":"Örhängen","href":"/collections/orhangen","pos":5},
          {"title":"Väskor","href":"/collections/vaskor-och-tillbehor","pos":6},
          {"title":"Tillbehör","href":"/collections/tillbehor","pos":7}
        ]'
        when 'footer' then '[
          {"title":"Startsida","href":"/pages/startsida","pos":0},
          {"title":"Kontakta oss","href":"/pages/contact","pos":1},
          {"title":"Spåra din beställning","href":"/pages/contact","pos":2},
          {"title":"Vanliga frågor","href":"/pages/vanliga-fragor","pos":3}
        ]'
        when 'about' then '[{"title":"Om oss","href":"/pages/om-oss","pos":0}]'
        when 'terms' then '[
          {"title":"Köpvillkor","href":"/pages/aterbetalningspolicy","pos":0},
          {"title":"Användarvillkor","href":"/pages/anvandarvillkor","pos":1}
        ]'
        when 'social' then '[
          {"title":"Instagram","href":"https://www.instagram.com/jawharasverige","pos":0},
          {"title":"TikTok","href":"https://www.tiktok.com/@jawhara.sverige","pos":1},
          {"title":"Facebook","href":"https://www.facebook.com/profile.php?id=61590794971964&locale=sv_SE","pos":2}
        ]'
      end)::jsonb
    ) as item(title text, href text, pos integer)
  where storefront_menus.handle in ('main-menu', 'footer', 'about', 'terms', 'social');
