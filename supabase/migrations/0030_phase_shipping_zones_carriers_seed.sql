-- Carries forward the real current shipping_allowed_countries/shipping_flat_rate values
-- (["SE"], 0 kr -- confirmed unchanged since migration 0023's seed) into the new zones model, as
-- one real zone with one real rate -- not an invented default. Then retires the old single-value
-- settings, which nothing outside the now-replaced shipping settings page ever read.

insert into shipping_zones (name, countries, position) values ('Sverige', array['SE'], 0);

insert into shipping_rates (zone_id, name, price, position)
select id, 'Standardfrakt', 0, 0 from shipping_zones where name = 'Sverige';

delete from store_settings where key in ('shipping_allowed_countries', 'shipping_flat_rate');

-- Two real, well-known Swedish carriers with their real public tracking-URL formats (PostNord's
-- and DHL's own documented tracking page URL patterns) -- an admin can add/edit/remove freely;
-- these are starting data, not a fixed list.
insert into shipping_carriers (name, tracking_url_template, position) values
('PostNord', 'https://www.postnord.se/en/tracking?shipmentId={trackingNumber}', 0),
('DHL', 'https://www.dhl.com/se-en/home/tracking.html?tracking-id={trackingNumber}', 1);
