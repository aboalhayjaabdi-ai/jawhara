-- "Valfri Plånbok" becomes "Valfritt Smycke": buy a bag, get any piece of jewelry free.
--
-- 1. The discount: same buy side as before (every bag it lists today), the get side becomes all
--    jewelry -- exactly the jewelry collections the live "3 för 2" promotion already uses, so
--    "all jewelry" means the same thing in both offers. Then saved once in Jawhara admin
--    (Rabatter) or pushed by lib/shopify/discount-sync.ts so Shopify's own discount matches.
update discounts
set title = 'Valfritt Smycke',
    get_item_type = 'collection',
    get_item_ids = (
      select buy_item_ids from discounts
      where title = '3 för 2' and kind = 'automatic' and status = 'active' and buy_item_type = 'collection'
      limit 1
    )
where title = 'Valfri Plånbok'
  and exists (
    select 1 from discounts
    where title = '3 för 2' and kind = 'automatic' and status = 'active' and buy_item_type = 'collection'
  );

-- 2. The offer box on bag product pages (every template whose box offered a wallet): new text,
--    a jewelry image (Klöver armband) and the button to all jewelry.
update product_templates
set offer_message = offer_message || jsonb_build_object(
      'heading', 'Få ett valfritt smycke på köpet!',
      'body', 'Köp en väska och få ett valfritt smycke!',
      'href', '/collections/alla-smycken',
      'image', 'https://jghzjdirxdxtshywezxz.supabase.co/storage/v1/object/public/product-media/10788375298386/70698419290450.png'
    ),
    updated_at = now()
where offer_message is not null
  and offer_message::text ilike '%plånb%';
