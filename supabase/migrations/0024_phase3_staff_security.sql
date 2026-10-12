-- Phase 3 of the admin-completion roadmap: real staff accounts and role-based permissions.
-- admin_users has always only ever been created via a direct database edit (confirmed by grep --
-- no app code anywhere inserts into it). This adds the columns an admin-driven invite/management
-- UI needs: a disable switch (so access can be revoked without deleting the underlying auth user
-- or losing audit_log/order/etc. foreign-key history, which cascades/sets-null on auth.users
-- deletion) and who invited whom, for the staff list's own audit trail.

alter table admin_users add column disabled boolean not null default false;
alter table admin_users add column invited_by uuid references admin_users (id) on delete set null;

-- Every pre-existing admin_users row is a real, already-trusted admin (the original account(s)
-- created by direct SQL) -- never auto-disabled by this migration.
