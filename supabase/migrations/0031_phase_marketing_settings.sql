-- Marketing/analytics integration settings (Meta Pixel + Conversions API, GA4). Deliberately a
-- separate, admin-only-RLS table rather than reusing store_settings, which has a "public read"
-- policy (0006_store_settings.sql) -- the Meta CAPI access token is a real secret and must never
-- be readable through the anon key. The two non-secret IDs (pixel ID, GA4 measurement ID) are
-- still only ever read server-side (via the service-role client) and explicitly hand-picked
-- before being passed to client code -- see lib/admin/marketing-settings.ts's
-- getPublicMarketingIds(), which never selects the token column at all.

create table marketing_settings (
  id uuid primary key default gen_random_uuid(),
  meta_pixel_id text,
  meta_capi_access_token text,
  ga4_measurement_id text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users (id) on delete set null
);

insert into marketing_settings (meta_pixel_id, meta_capi_access_token, ga4_measurement_id) values (null, null, null);

alter table marketing_settings enable row level security;
create policy "admin only" on marketing_settings for all using (is_admin());
