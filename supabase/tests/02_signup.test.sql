-- Phase 2 tests required: sign-up always yields LEARNER even if the client sends another role;
-- an email sign-up with an empty first or second name is rejected; a Google-style sign-up with no
-- family name yields profile_completed = false (D01, D02, D27).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(20);

-- Email sign-up: LEARNER, ACTIVE, names copied, preferences row created
select lives_ok(
  $$ select tests.create_user('ama@example.test', 'Ama', 'Mensah') $$,
  'email sign-up with both names succeeds'
);
select results_eq(
  $$ select role::text, account_status::text, first_name, second_name, email, profile_completed, can_create_courses
       from public.profiles where email = 'ama@example.test' $$,
  $$ values ('LEARNER', 'ACTIVE', 'Ama', 'Mensah', 'ama@example.test', true, false) $$,
  'email sign-up creates a LEARNER, ACTIVE, completed profile'
);
select is(
  (select email_enabled from public.notification_preferences n join public.profiles p on p.id = n.user_id
    where p.email = 'ama@example.test'),
  true,
  'sign-up creates notification preferences with email on'
);

-- Names are trimmed
select lives_ok(
  $$ select tests.create_user('kofi@example.test', '  Kofi ', ' Owusu  ') $$, 'names with spaces are accepted'
);
select results_eq(
  $$ select first_name, second_name from public.profiles where email = 'kofi@example.test' $$,
  $$ values ('Kofi', 'Owusu') $$,
  'names are trimmed'
);

-- The client cannot choose a role, status or course-creation right
select lives_ok(
  $$ select tests.create_user('sneaky@example.test', p_user_meta =>
       '{"first_name":"Sneaky","second_name":"Person","role":"ADMIN","account_status":"ACTIVE","can_create_courses":true}'::jsonb) $$,
  'sign-up carrying role ADMIN in user metadata completes'
);
select results_eq(
  $$ select role::text, can_create_courses from public.profiles where email = 'sneaky@example.test' $$,
  $$ values ('LEARNER', false) $$,
  'a role sent by the client is ignored: the account is LEARNER'
);
select lives_ok(
  $$ select tests.create_user('sneaky2@example.test', p_user_meta =>
       '{"first_name":"Sneaky","second_name":"Two","role":"LECTURER"}'::jsonb) $$,
  'sign-up carrying role LECTURER completes'
);
select is(
  (select role::text from public.profiles where email = 'sneaky2@example.test'), 'LEARNER',
  'LECTURER sent by the client is ignored'
);

-- Empty names are rejected for email sign-up
select throws_ok(
  $$ select tests.create_user('nofirst@example.test', '', 'Mensah') $$,
  '22023', NULL, 'email sign-up with an empty first name is rejected'
);
select throws_ok(
  $$ select tests.create_user('nosecond@example.test', 'Ama', '') $$,
  '22023', NULL, 'email sign-up with an empty second name is rejected'
);
select throws_ok(
  $$ select tests.create_user('blank@example.test', '   ', 'Mensah') $$,
  '22023', NULL, 'email sign-up with a whitespace-only name is rejected'
);
select throws_ok(
  $$ select tests.create_user('nometa@example.test', p_user_meta => '{}'::jsonb) $$,
  '22023', NULL, 'email sign-up with no names at all is rejected'
);
select is(
  (select count(*)::int from auth.users where email in ('nofirst@example.test', 'nosecond@example.test', 'blank@example.test', 'nometa@example.test')),
  0,
  'a rejected sign-up leaves no auth user behind'
);

-- Google sign-up
select lives_ok(
  $$ select tests.create_user('yaw@gmail.test', 'Yaw', 'Boateng', p_provider => 'google') $$,
  'Google sign-up with given and family name succeeds'
);
select results_eq(
  $$ select role::text, first_name, second_name, profile_completed from public.profiles where email = 'yaw@gmail.test' $$,
  $$ values ('LEARNER', 'Yaw', 'Boateng', true) $$,
  'Google sign-up copies given and family name and is complete'
);
select lives_ok(
  $$ select tests.create_user('mononym@gmail.test', p_provider => 'google',
       p_user_meta => '{"given_name":"Esi","email":"mononym@gmail.test","role":"ADMIN"}'::jsonb) $$,
  'Google sign-up with no family name succeeds'
);
select results_eq(
  $$ select role::text, first_name, second_name, profile_completed from public.profiles where email = 'mononym@gmail.test' $$,
  $$ values ('LEARNER', 'Esi', '', false) $$,
  'Google sign-up with no family name yields profile_completed = false (and still LEARNER)'
);
select is(
  (select avatar_url_imported from (select profile_image_file_id is not null as avatar_url_imported from public.profiles where email = 'yaw@gmail.test') s),
  false,
  'the Google profile photo is not imported (D27 item 6)'
);

-- Email change in auth is mirrored to the profile
update auth.users set email = 'ama.new@example.test' where email = 'ama@example.test';
select is(
  (select count(*)::int from public.profiles where email = 'ama.new@example.test'), 1,
  'an email change in auth.users is mirrored to profiles.email'
);

select * from finish();
rollback;
