-- Step 11.1 (owner request of 2026-11-11, ADR-020 item 7): every administrator setting takes effect.
-- - Storage bucket size limits follow file_limits at once (the largest kind kept in each bucket);
--   other settings leave the buckets alone.
-- - client_settings gives every active signed-in user the upload limits, the pass mark and whether courses
--   need approval; never anonymous visitors or inactive accounts; nothing sensitive.
-- - Only an administrator can change file_limits (and so the buckets).
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(16);

select set_config('t.a1', tests.create_user('a1@example.test', 'Prince', 'Boateng', 'ADMIN')::text, true);
select set_config('t.t1', tests.create_user('t1@example.test', 'Ama', 'Boateng', 'LECTURER')::text, true);
select set_config('t.l1', tests.create_user('l1@example.test', 'Kwame', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Esi', 'Owusu')::text, true);
update public.profiles set account_status = 'SUSPENDED' where id = current_setting('t.l2')::uuid;
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;
create function tests.bucket_limit(p text) returns bigint language sql stable security definer set search_path = '' as $$
  select file_size_limit from storage.buckets where id = p $$;
grant execute on function tests.bucket_limit(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- buckets start from the setting
select is(tests.bucket_limit('profile-images'), 2097152::bigint, 'profile photos start at the 2 MB of file_limits');
select is(tests.bucket_limit('learner-submissions'), 26214400::bigint, 'answers take the larger of audio (25 MB) and documents (10 MB)');

-- ---------------------------------------------------------------- an administrator changes a limit
select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.system_settings set value = jsonb_set(value, '{profile_image,max_bytes}', '5242880') where key = 'file_limits' $$,
  'an administrator raises the profile photo limit to 5 MB');
select tests.reset();
select is(tests.bucket_limit('profile-images'), 5242880::bigint, 'and Storage takes 5 MB photos at once');
select is(tests.bucket_limit('course-covers'), 2097152::bigint, 'other buckets keep their own limits');

select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.system_settings set value = jsonb_set(value, '{submission_document,max_bytes}', '52428800') where key = 'file_limits' $$,
  'raising the answer document limit above the audio limit');
select tests.reset();
select is(tests.bucket_limit('learner-submissions'), 52428800::bigint, 'raises the answers bucket to the larger limit');

select tests.authenticate_as(tests.uid('a1'), 'aal2');
select lives_ok($$ update public.system_settings set value = jsonb_set(value, '{lesson_audio,max_bytes}', '10485760') where key = 'file_limits' $$,
  'lowering the lesson audio limit');
select tests.reset();
select is(tests.bucket_limit('lesson-audio'), 10485760::bigint, 'lowers the lesson audio bucket too');

-- ---------------------------------------------------------------- nobody else changes limits
select tests.authenticate_as(tests.uid('t1'));
update public.system_settings set value = jsonb_set(value, '{profile_image,max_bytes}', '1024') where key = 'file_limits';
select tests.reset();
select is(tests.bucket_limit('profile-images'), 5242880::bigint, 'a lecturer cannot change the limits or the buckets');
select tests.authenticate_as(tests.uid('a1'));
update public.system_settings set value = jsonb_set(value, '{profile_image,max_bytes}', '1024') where key = 'file_limits';
select tests.reset();
select is(tests.bucket_limit('profile-images'), 5242880::bigint, 'nor an administrator without two-step verification');

-- ---------------------------------------------------------------- client_settings
select tests.authenticate_as(tests.uid('l1'));
select is((public.client_settings() #>> '{file_limits,profile_image,max_bytes}')::bigint, 5242880::bigint,
  'a learner reads the current profile photo limit');
select is(public.client_settings() -> 'require_course_approval', 'true'::jsonb, 'and whether courses need approval');
select ok(not (public.client_settings()::text ~ 'extensions|retention|session_limits|notification_retry'),
  'and nothing else: no extensions lists and no sensitive settings');
select tests.reset(); select tests.authenticate_as(tests.uid('l2'));
select throws_ok($$ select public.client_settings() $$, '42501', null, 'an inactive account reads nothing');
select tests.reset(); set local role anon;
select throws_ok($$ select public.client_settings() $$, '42501', null, 'an anonymous visitor reads nothing');

select * from finish();
rollback;
