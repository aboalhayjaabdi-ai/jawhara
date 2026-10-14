-- The cron job's atomic claim step (app/api/cron/review-requests/route.ts) moves a row to a
-- transient 'sending' status before actually sending, so two overlapping cron runs can never
-- both process the same row -- 0040's check constraint never allowed that value, which made
-- every claim attempt a silent constraint violation.

alter table review_request_schedule drop constraint review_request_schedule_status_check;
alter table review_request_schedule add constraint review_request_schedule_status_check
  check (status in ('scheduled', 'sending', 'sent', 'skipped', 'failed'));
