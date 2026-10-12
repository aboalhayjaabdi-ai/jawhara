-- Phase 9 (admin completion, part 2): shipping settings storage. Seeded to exactly match the
-- real current checkout behavior (Stripe shipping_address_collection: SE only, shipping always
-- free) so saving this UI's defaults unchanged would be a no-op. NOT yet consumed by
-- app/api/checkout/route.ts -- deliberately: that file, app/api/webhooks/stripe/route.ts, and
-- lib/discounts.ts's calculation logic are the three explicitly protected checkout files this
-- project has never edited without a separate, explicit go-ahead, since changes there directly
-- affect what customers are charged. This migration only adds the storage; wiring it into live
-- checkout is a distinct, flagged decision (see the Phase 9 verification report).

insert into store_settings (key, value) values
  ('shipping_allowed_countries', '["SE"]'),
  ('shipping_flat_rate', '0')
on conflict (key) do nothing;
