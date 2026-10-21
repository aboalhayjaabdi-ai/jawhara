-- Distinguishes which scheduler actually produced each reconciliation run (cron_sync = daily
-- Vercel Cron, github_actions = the ~5-minute GitHub Actions sweep, pg_cron = the reliable
-- Supabase-native 5-minute scheduler) so missed/underperforming schedulers are visible per source
-- rather than only in aggregate.
alter table cron_sync_runs add column if not exists source text;
