-- First-party website analytics: sessions + events logged by visitors browsing the storefront
-- (app/api/analytics/track, called from lib/marketing/first-party-analytics.ts), gated behind the
-- same cookie consent as the Meta Pixel/GA4 (lib/marketing/consent.ts) -- nothing is written here
-- before a visitor accepts. Powers the admin "Webbplatsstatistik" section
-- (app/admin/(authenticated)/analytics).
--
-- `if not exists`/`or replace` throughout: these tables and functions were already created
-- directly against the production database by an earlier session (originally numbered 0042 on a
-- sibling branch that never got merged here, before this branch's own 0042 was taken by
-- meta_capi_purchase_tracking.sql) and already hold real historical visit data -- this migration
-- only brings that schema into this branch's version-controlled history so a fresh environment
-- (staging, a new preview DB) ends up with the same objects. Running it again against production
-- is a safe no-op.
--
-- `id` on both tables is client-generated text (crypto.randomUUID(), with a non-crypto fallback
-- for very old browsers) rather than a Postgres-generated uuid -- the client labels every event it
-- fires with its own session id before the server has ever seen that session.

create table if not exists analytics_sessions (
  id text primary key,
  visitor_id text not null,
  traffic_source text not null check (traffic_source in ('instagram', 'facebook', 'google', 'direct', 'other')),
  landing_path text,
  started_at timestamptz not null default now()
);

create index if not exists analytics_sessions_started_at_idx on analytics_sessions (started_at);
create index if not exists analytics_sessions_visitor_id_idx on analytics_sessions (visitor_id);

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  session_id text not null references analytics_sessions (id) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'view_content', 'add_to_cart', 'initiate_checkout')),
  path text,
  product_handle text,
  product_title text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on analytics_events (created_at);
create index if not exists analytics_events_type_created_idx on analytics_events (event_type, created_at);
create index if not exists analytics_events_session_id_idx on analytics_events (session_id);

alter table analytics_sessions enable row level security;
alter table analytics_events enable row level security;

-- Admin-only read, same as orders/webhook_events -- no insert/update policy for anon/authenticated,
-- since every write comes from app/api/analytics/track's service-role client (bypasses RLS), never
-- directly from a visitor's browser.
drop policy if exists "admin only" on analytics_sessions;
create policy "admin only" on analytics_sessions for select using (is_admin());
drop policy if exists "admin only" on analytics_events;
create policy "admin only" on analytics_events for select using (is_admin());

-- ---------------------------------------------------------------------------------------------
-- Aggregation RPCs for the admin dashboard. Plain SECURITY INVOKER (the default -- deliberately
-- NOT "security definer" like the inventory-decrement functions elsewhere in this project, which
-- need to bypass RLS for public checkout calls): these must run as the calling (authenticated
-- admin) role so the "admin only" policies above are actually enforced, same as any direct
-- `.from("analytics_events").select()` call would be.
--
-- p_from/p_to are Stockholm-local calendar dates (inclusive both ends) -- the caller
-- (lib/admin/web-analytics.ts) resolves "Idag"/"Igår"/7d/30d/custom into these plain dates, and the
-- `at time zone` conversions below do the real Stockholm-day-boundary math using Postgres's own
-- timezone database (correct across DST transitions, unlike hand-rolled JS offset arithmetic).
-- ---------------------------------------------------------------------------------------------

create or replace function analytics_summary(p_from date, p_to date, p_tz text default 'Europe/Stockholm')
returns table (
  sessions bigint,
  unique_visitors bigint,
  page_views bigint,
  product_views bigint,
  product_view_sessions bigint,
  add_to_cart_sessions bigint,
  checkout_sessions bigint
)
language sql
stable
as $$
  select
    (select count(*) from analytics_sessions s
       where s.started_at >= (p_from::timestamp at time zone p_tz) and s.started_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(distinct s.visitor_id) from analytics_sessions s
       where s.started_at >= (p_from::timestamp at time zone p_tz) and s.started_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(*) from analytics_events e
       where e.event_type = 'page_view'
         and e.created_at >= (p_from::timestamp at time zone p_tz) and e.created_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(*) from analytics_events e
       where e.event_type = 'view_content'
         and e.created_at >= (p_from::timestamp at time zone p_tz) and e.created_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(distinct e.session_id) from analytics_events e
       where e.event_type = 'view_content'
         and e.created_at >= (p_from::timestamp at time zone p_tz) and e.created_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(distinct e.session_id) from analytics_events e
       where e.event_type = 'add_to_cart'
         and e.created_at >= (p_from::timestamp at time zone p_tz) and e.created_at < ((p_to + 1)::timestamp at time zone p_tz)),
    (select count(distinct e.session_id) from analytics_events e
       where e.event_type = 'initiate_checkout'
         and e.created_at >= (p_from::timestamp at time zone p_tz) and e.created_at < ((p_to + 1)::timestamp at time zone p_tz))
$$;

create or replace function analytics_top_products(p_from date, p_to date, p_tz text default 'Europe/Stockholm', p_limit int default 5)
returns table (product_handle text, product_title text, views bigint)
language sql
stable
as $$
  select e.product_handle, max(e.product_title) as product_title, count(*) as views
  from analytics_events e
  where e.event_type = 'view_content'
    and e.product_handle is not null
    and e.created_at >= (p_from::timestamp at time zone p_tz)
    and e.created_at < ((p_to + 1)::timestamp at time zone p_tz)
  group by e.product_handle
  order by views desc
  limit p_limit
$$;

create or replace function analytics_traffic_sources(p_from date, p_to date, p_tz text default 'Europe/Stockholm')
returns table (traffic_source text, sessions bigint)
language sql
stable
as $$
  select s.traffic_source, count(*) as sessions
  from analytics_sessions s
  where s.started_at >= (p_from::timestamp at time zone p_tz)
    and s.started_at < ((p_to + 1)::timestamp at time zone p_tz)
  group by s.traffic_source
  order by sessions desc
$$;

create or replace function analytics_daily_visits(p_from date, p_to date, p_tz text default 'Europe/Stockholm')
returns table (day date, sessions bigint)
language sql
stable
as $$
  select (s.started_at at time zone p_tz)::date as day, count(*) as sessions
  from analytics_sessions s
  where s.started_at >= (p_from::timestamp at time zone p_tz)
    and s.started_at < ((p_to + 1)::timestamp at time zone p_tz)
  group by 1
  order by 1
$$;
