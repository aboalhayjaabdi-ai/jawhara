-- Restores "Valfri Plånbok" exactly as it was before 0050 (buy a bag, get a wallet): the same
-- buy side (unchanged by 0050), the get side back to the 18 wallets (every "… Plånbok" product),
-- active again, and the bag offer box's original text, wallet image and link to Plånböcker.
update discounts
set title = 'Valfri Plånbok',
    status = 'active',
    get_item_type = 'product',
    get_item_ids = '["11199970181458","16169283289470","11200060916050","16169283355006","11199982305618","11199982174546","11200061014354","11200060948818","11200060850514","11200060817746","11200060784978","11199982338386","11199982272850","11199982207314","11199982141778","11199973687634","11199973327186","11199971623250"]'::jsonb
where id = 'b485e973-9853-43b7-80dc-e8d78c76104b';

update product_templates
set offer_message = jsonb_build_object(
      'heading', 'Få en valfri plånbok på köpet!',
      'body', 'Köp en väska och få en valfri plånbok!',
      'href', '/collections/tillbehor',
      'image', 'https://jghzjdirxdxtshywezxz.supabase.co/storage/v1/object/public/product-media/imports/amarenti/cc-planbok.png'
    ),
    updated_at = now()
where key in ('vaskor', 'erbjudande-vaskor');
