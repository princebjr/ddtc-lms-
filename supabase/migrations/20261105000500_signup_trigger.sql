-- Phase 2, migration 5: every new auth user gets a LEARNER, ACTIVE profile (D01, D02, D27).
-- The role is never read from client data: raw_user_meta_data is client-controlled, so only the
-- names are taken from it. Email sign-up requires both names; Google sign-up copies given_name and
-- family_name and marks the profile incomplete when either is missing. The Google photo is not
-- imported. Administrators and lecturers are created as learners and then promoted by the trusted
-- provision-lecturer / set-user-role functions (Phase 4).

create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_first text;
  v_second text;
begin
  if v_provider = 'google' then
    v_first := btrim(coalesce(v_meta ->> 'given_name', ''));
    v_second := btrim(coalesce(v_meta ->> 'family_name', ''));
  else
    v_first := btrim(coalesce(v_meta ->> 'first_name', ''));
    v_second := btrim(coalesce(v_meta ->> 'second_name', ''));
    if v_first = '' or v_second = '' then
      raise exception 'First name and second name are required' using errcode = '22023';
    end if;
  end if;

  insert into public.profiles (id, first_name, second_name, email, role, account_status, can_create_courses, profile_completed)
  values (new.id, left(v_first, 100), left(v_second, 100), coalesce(new.email, ''), 'LEARNER', 'ACTIVE', false,
          v_first <> '' and v_second <> '');

  insert into public.notification_preferences (user_id) values (new.id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'account.created', 'profile', new.id::text, jsonb_build_object('provider', v_provider));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profiles.email in step with the verified auth email.
create function private.handle_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

revoke execute on function private.handle_new_user(), private.handle_user_email_change() from public, anon, authenticated;
