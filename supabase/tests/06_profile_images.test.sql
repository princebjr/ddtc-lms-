-- Phase 4: the `profile-images` bucket (DATA_MODEL.md section 6, D18, D19, D33). Any signed-in
-- ACTIVE user may read a profile image, but only one whose file_objects row is VALIDATED; nobody
-- writes to the bucket directly (uploads go through register-upload, a signed upload URL for the
-- server-chosen path, then finalize-upload). Test required: a PENDING or REJECTED image is never
-- shown.
begin;
create extension if not exists pgtap with schema extensions;
\ir _helpers.psql

select plan(19);

select set_config('t.l1', tests.create_user('l1@example.test', 'Ama', 'Mensah')::text, true);
select set_config('t.l2', tests.create_user('l2@example.test', 'Kofi', 'Owusu')::text, true);
select set_config('t.s1', tests.create_user('s1@example.test', 'Sus', 'Pended', 'LEARNER', 'SUSPENDED')::text, true);
create function tests.uid(p text) returns uuid language sql stable as $$ select current_setting('t.' || p)::uuid $$;
grant execute on function tests.uid(text) to anon, authenticated, service_role;

-- The bucket
select ok(exists (select 1 from storage.buckets where id = 'profile-images'), 'the profile-images bucket exists');
select is((select public from storage.buckets where id = 'profile-images'), false, 'the bucket is private');
select is((select file_size_limit from storage.buckets where id = 'profile-images'), 2097152::bigint, 'the bucket caps files at 2 MB (D17)');
select is((select allowed_mime_types from storage.buckets where id = 'profile-images'), array['image/jpeg', 'image/png', 'image/webp'],
  'the bucket accepts JPEG, PNG and WebP only');

-- Three objects owned by l1: VALIDATED, PENDING and REJECTED
insert into public.file_objects (id, bucket_name, storage_path, original_filename, safe_download_filename, uploaded_by, status, resource_type, detected_mime_type, file_size, validated_at, validation_error)
values
  ('00000000-0000-4000-8000-0000000000a1', 'profile-images', tests.uid('l1') || '/a1.png', 'a.png', 'a.png', tests.uid('l1'), 'VALIDATED', 'PROFILE_IMAGE', 'image/png', 1000, now(), null),
  ('00000000-0000-4000-8000-0000000000a2', 'profile-images', tests.uid('l1') || '/a2.png', 'b.png', 'b.png', tests.uid('l1'), 'PENDING', 'PROFILE_IMAGE', null, null, null, null),
  ('00000000-0000-4000-8000-0000000000a3', 'profile-images', tests.uid('l1') || '/a3.png', 'c.png', 'c.png', tests.uid('l1'), 'REJECTED', 'PROFILE_IMAGE', null, null, null, 'not an image');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('profile-images', tests.uid('l1') || '/a1.png', tests.uid('l1')::text, '{"mimetype":"image/png","size":1000}'),
  ('profile-images', tests.uid('l1') || '/a2.png', tests.uid('l1')::text, '{"mimetype":"image/png","size":1000}'),
  ('profile-images', tests.uid('l1') || '/a3.png', tests.uid('l1')::text, '{"mimetype":"image/png","size":1000}');

-- Another signed-in user sees only the VALIDATED image
select tests.authenticate_as(tests.uid('l2'));
select results_eq($$ select name from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%' order by name $$,
  $$ select tests.uid('l1') || '/a1.png' $$, 'a signed-in user can read a VALIDATED profile image only');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%' and name like '%/a2.png'), 0, 'a PENDING image is never readable');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%' and name like '%/a3.png'), 0, 'a REJECTED image is never readable');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('profile-images', tests.uid('l2') || '/x.png', tests.uid('l2')::text) $$,
  '42501', NULL, 'a signed-in user cannot write to the bucket directly');
update storage.objects set name = name || '.moved' where bucket_id = 'profile-images';
-- Storage refuses direct deletes for every role; removal goes through the Storage API.
select throws_like($$ delete from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%' $$, '%Direct deletion from storage tables is not allowed%',
  'a signed-in user cannot delete objects directly');
select tests.reset();
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%' and name not like '%.moved'), 3, 'a signed-in user cannot rename or delete objects');

-- The owner gets no extra rights over unvalidated files
select tests.authenticate_as(tests.uid('l1'));
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%'), 1, 'the owner too sees only the VALIDATED image');
select tests.reset();

-- Suspended users and visitors see nothing
select tests.authenticate_as(tests.uid('s1'));
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%'), 0, 'a suspended user reads no profile images');
select tests.reset();
select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%'), 0, 'anon reads no profile images');
select tests.reset();

-- Once a file is DELETED it is no longer readable, even if the object still exists (cleanup pending)
update public.file_objects set status = 'DELETED', deleted_at = now() where id = '00000000-0000-4000-8000-0000000000a1';
select tests.authenticate_as(tests.uid('l2'));
select is((select count(*)::int from storage.objects where bucket_id = 'profile-images' and name like tests.uid('l1') || '/%'), 0, 'a DELETED file is not readable');
select tests.reset();

-- Replaced images are found by the cleanup job: VALIDATED profile images no profile points to
update public.file_objects set status = 'VALIDATED', deleted_at = null where id = '00000000-0000-4000-8000-0000000000a1';
select has_function('public', 'files_due_for_cleanup', array['integer'], 'files_due_for_cleanup exists (for the cleanup-files job)');
select is(has_function_privilege('authenticated', 'public.files_due_for_cleanup(integer)', 'execute'), false, 'clients cannot call files_due_for_cleanup');
select tests.as_service();
select ok((select count(*) from public.files_due_for_cleanup(100) f where f.id = '00000000-0000-4000-8000-0000000000a1') = 1,
  'an unreferenced VALIDATED profile image is due for removal');
select tests.reset();

-- The hourly cleanup job is scheduled (it reads its URL and key from Vault at run time)
select is((select schedule from cron.job where jobname = 'cleanup-files-hourly'), '17 * * * *', 'cleanup-files runs every hour');
select is(has_function_privilege('authenticated', 'private.call_cleanup_files()', 'execute'), false, 'clients cannot trigger the cleanup job');

select * from finish();
rollback;
