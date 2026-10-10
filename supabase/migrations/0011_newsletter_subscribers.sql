-- Real footer newsletter signup ("Prenumerera på vårt nyhetsbrev", sections/footer-group.json's
-- email-signup block) -- no email marketing platform is wired up yet, so this table is the
-- functional, durable record of each signup, same pattern as contact_submissions.

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table newsletter_subscribers enable row level security;

create policy "public insert" on newsletter_subscribers for insert with check (true);
create policy "admin read" on newsletter_subscribers for select using (is_admin());
