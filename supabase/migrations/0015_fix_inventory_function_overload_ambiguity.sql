-- Critical fix: `create or replace function` only replaces a function when its parameter LIST
-- (not just its name) matches exactly. Migrations 0013 and 0014 each added trailing params to
-- decrement_inventory/force_decrement_inventory, which created NEW overloads alongside the
-- original 2-arg ones from 0005/0009 (and, for force_decrement_inventory, alongside 0013's own
-- 5-arg version too) instead of replacing them. With 2-3 overloads of the same name differing
-- only in trailing defaulted params, Postgres can no longer pick a single candidate for a call
-- using fewer args than the longest overload -- exactly the kind of 2-arg call the live Stripe
-- webhook (app/api/webhooks/stripe/route.ts) makes on every real checkout. That call was failing
-- with "could not choose the best candidate function" from the moment 0013 was applied, silently
-- breaking production inventory decrement. This drops every superseded overload so each function
-- name resolves to exactly one definition again.
drop function if exists decrement_inventory(uuid, integer);
drop function if exists force_decrement_inventory(uuid, integer);
drop function if exists force_decrement_inventory(uuid, integer, text, uuid, uuid);
