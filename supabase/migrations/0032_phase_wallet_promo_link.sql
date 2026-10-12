-- Adds a real link to the existing "Få en valfri plånbok på köpet!" offer box, pointing at the
-- real, verified Tillbehör collection (confirmed to hold 16 of its 17 products as the live
-- "Valfri Plånbok" discount's actual eligible wallets). Heading/body text is preserved verbatim --
-- only the `href` key is added to the existing jsonb object.
update product_templates
set offer_message = offer_message || jsonb_build_object('href', '/collections/tillbehor')
where key = 'erbjudande-vaskor';
