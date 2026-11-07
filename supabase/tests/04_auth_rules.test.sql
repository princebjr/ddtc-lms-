-- Phase 3 database rules (owner-approved mechanisms, 2026-11-05).
-- D27 (4): a Google sign-in whose email matches an ADMIN or LECTURER is refused and links nothing.
-- D27 (5): a verified-email match links to the existing LEARNER; an unverified match is refused.
-- D27 (2): only Google accounts whose email is verified are accepted.
-- D32: ADMIN sessions end after 12 hours, or after a period without activity (D43: idle_timeout_minutes, 10 by default; was 30), enforced in is_admin().
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(26);

select set_config('t.admin', tests.create_user('admin@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.lect', tests.create_user('lect@example.test', 'Sarah', 'Ofori', 'LECTURER')::text, true);
select set_config('t.learn', tests.create_user('learn@example.test', 'Ama', 'Mensah')::text, true);
select set_config('t.unver', tests.create_user('unver@example.test', 'Kofi', 'Owusu')::text, true);
update auth.users set email_confirmed_at = null where id = current_setting('t.unver')::uuid;

create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

-- Every existing account has its email identity, as GoTrue creates it.
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', u.email_confirmed_at is not null), now(), now()
  from auth.users u where u.id in (tests.uid('admin'), tests.uid('lect'), tests.uid('learn'), tests.uid('unver'));

/** Inserts a Google identity for a user, as GoTrue does when it links or creates one. */
create function tests.add_google(p_user uuid, p_email text, p_verified boolean default true) returns void
language sql as $$
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), p_user, 'google-' || p_user, 'google',
          jsonb_build_object('sub', 'google-' || p_user, 'email', p_email, 'email_verified', p_verified), now(), now());
$$;

-- ---------------------------------------------------------------- D27 (4): staff refused
select has_trigger('auth', 'identities', 'guard_identity_link', 'auth.identities has the Google guard trigger');
select throws_ok($$ select tests.add_google(tests.uid('admin'), 'admin@example.test') $$, '42501', NULL,
  'Google sign-in matching an ADMIN is refused');
select throws_ok($$ select tests.add_google(tests.uid('lect'), 'lect@example.test') $$, '42501', NULL,
  'Google sign-in matching a LECTURER is refused');
select is((select count(*)::int from auth.identities where provider = 'google' and user_id in (tests.uid('admin'), tests.uid('lect'))), 0,
  'a refused Google sign-in links nothing to staff accounts');

-- ---------------------------------------------------------------- D27 (5): learners
select lives_ok($$ select tests.add_google(tests.uid('learn'), 'learn@example.test') $$,
  'Google sign-in matching a verified LEARNER links');
select is((select count(*)::int from auth.identities where provider = 'google' and user_id = tests.uid('learn')), 1,
  'the verified learner now has a Google identity');
select is((select role::text from public.profiles where id = tests.uid('learn')), 'LEARNER', 'linking does not change the role');
select throws_ok($$ select tests.add_google(tests.uid('unver'), 'unver@example.test') $$, '42501', NULL,
  'Google sign-in matching a LEARNER with an unverified email is refused');
select is((select count(*)::int from auth.identities where provider = 'google' and user_id = tests.uid('unver')), 0,
  'nothing is linked to the unverified learner');

-- ---------------------------------------------------------------- D27 (2): verified Google email only
select set_config('t.newg', tests.create_user('newg@gmail.test', 'Yaw', 'Addo', p_provider => 'google')::text, true);
select throws_ok($$ select tests.add_google(tests.uid('newg'), 'newg@gmail.test', false) $$, '42501', NULL,
  'a Google account whose email is not verified is refused');
select lives_ok($$ select tests.add_google(tests.uid('newg'), 'newg@gmail.test') $$,
  'a new Google user (first identity, verified email) is accepted');
select is((select role::text from public.profiles where id = tests.uid('newg')), 'LEARNER', 'the new Google user is a LEARNER');

-- A staff account promoted later cannot keep using Google either: the guard checks the role on every link.
-- (GoTrue updates the existing identity on every Google sign-in, so the guard also runs on UPDATE.)
select set_config('t.promo', tests.create_user('promo@example.test', 'Esi', 'Addo')::text, true);
select tests.add_google(tests.uid('promo'), 'promo@example.test');
update public.profiles set role = 'LECTURER' where id = tests.uid('promo');
select throws_ok($$ update auth.identities set last_sign_in_at = now() where user_id = tests.uid('promo') and provider = 'google' $$,
  '42501', NULL, 'a Google sign-in is refused once the account is promoted to LECTURER');
select lives_ok($$ insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), tests.uid('learn'), 'other-email', 'email', '{"email_verified":true}', now(), now()) $$,
  'non-Google identities are not affected by the guard');

-- ---------------------------------------------------------------- D32: administrator session limits
select tests.authenticate_as(tests.uid('admin'), 'aal2', tests.make_session(tests.uid('admin'), interval '1 hour', interval '5 minutes', 'aal2'));
select is((select private.is_admin()), true, 'admin: fresh AAL2 session, active 5 minutes ago, is an administrator');
select tests.reset();

select tests.authenticate_as(tests.uid('admin'), 'aal2', tests.make_session(tests.uid('admin'), interval '12 hours 1 minute', interval '1 minute', 'aal2'));
select is((select private.is_admin()), false, 'admin: a session older than 12 hours is refused');
select is((select count(*)::int from public.audit_logs), 0, 'admin: an expired session reads no audit logs');
select tests.reset();

select tests.authenticate_as(tests.uid('admin'), 'aal2', tests.make_session(tests.uid('admin'), interval '2 hours', interval '31 minutes', 'aal2'));
select is((select private.is_admin()), false, 'admin: 31 minutes without activity is refused');
select tests.reset();

-- A session with no activity recorded yet (the first requests right after MFA): idle time counts
-- from the start of the session, so a fresh one is accepted and an old one is not.
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('00000000-0000-4000-8000-00000000f5e1', tests.uid('admin'), now() - interval '1 minute', now(), 'aal2'),
       ('00000000-0000-4000-8000-00000000f5e2', tests.uid('admin'), now() - interval '31 minutes', now(), 'aal2');
select tests.authenticate_as(tests.uid('admin'), 'aal2', '00000000-0000-4000-8000-00000000f5e1');
select is((select private.is_admin()), true, 'admin: a fresh session with no activity yet is an administrator (no race after sign-in)');
select tests.reset();
select tests.authenticate_as(tests.uid('admin'), 'aal2', '00000000-0000-4000-8000-00000000f5e2');
select is((select private.is_admin()), false, 'admin: a session 31 minutes old with no activity at all is refused');
select tests.reset();

select tests.authenticate_as(tests.uid('admin'), 'aal2', gen_random_uuid());
select is((select private.is_admin()), false, 'admin: a JWT whose session does not exist is refused');
select tests.reset();

-- record_activity keeps an admin session alive, only for the caller's own session
select set_config('t.idle', tests.make_session(tests.uid('admin'), interval '1 hour', interval '25 minutes', 'aal2')::text, true);
select tests.authenticate_as(tests.uid('admin'), 'aal2', current_setting('t.idle')::uuid);
select lives_ok($$ select public.record_activity() $$, 'record_activity can be called by a signed-in user');
select is((select private.is_admin()), true, 'admin: still an administrator after activity');
select tests.reset();
select ok((select last_seen_at > now() - interval '1 minute' from private.session_activity where session_id = current_setting('t.idle')::uuid),
  'record_activity moved last_seen_at to now');

select tests.as_anon();
select throws_ok($$ select public.record_activity() $$, '42501', NULL, 'anon cannot call record_activity');
select tests.reset();

select is(
  (select coalesce(array_agg(distinct table_name::text), '{}') from information_schema.role_table_grants
    where table_schema = 'private' and table_name = 'session_activity' and grantee in ('anon', 'authenticated')),
  '{}'::text[],
  'clients have no direct access to session_activity'
);

select * from finish();
rollback;
