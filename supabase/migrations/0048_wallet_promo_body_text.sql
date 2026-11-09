-- Shortens the body of the "Få en valfri plånbok på köpet!" offer box on bag product pages.
-- Only the `body` key changes; heading, image and href are kept as they are.
update product_templates
set offer_message = jsonb_set(offer_message, '{body}', to_jsonb('Köp en väska och få en valfri plånbok!'::text))
where key in ('vaskor', 'erbjudande-vaskor') and offer_message is not null;
