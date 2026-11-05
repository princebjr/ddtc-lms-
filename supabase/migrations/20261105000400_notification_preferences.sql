-- Phase 2, migration 4: notification preferences (D21: users can turn off non-account emails;
-- account emails are always sent). One row per user, created by the sign-up trigger.

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete restrict,
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

alter table public.notification_preferences enable row level security;

revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant update (email_enabled) on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_preferences to service_role;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));

create policy notification_preferences_select_admin on public.notification_preferences
  for select to authenticated
  using ((select private.is_admin()));

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()));
