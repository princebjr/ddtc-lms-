-- Phase 4, migration 10: the `profile-images` bucket (DATA_MODEL.md section 6; D17, D18, D19, D33).
-- Private. Any signed-in ACTIVE user may read a profile image whose file_objects row is VALIDATED
-- (low sensitivity). There is no client write policy: register-upload creates the PENDING row and a
-- signed upload URL for the server-chosen path, and finalize-upload checks the bytes and validates
-- or rejects. Replaced and removed images are deleted by finalize-upload and the cleanup-files job.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

-- Answers only "is this object a VALIDATED file?" A plain subquery would run under the caller's
-- own RLS on file_objects (own rows only), so nobody could see another person's photo.
create function private.is_validated_object(p_bucket text, p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.file_objects f
     where f.bucket_name = p_bucket and f.storage_path = p_name and f.status = 'VALIDATED'
  );
$$;
revoke execute on function private.is_validated_object(text, text) from public, anon;
grant execute on function private.is_validated_object(text, text) to authenticated;

create policy profile_images_read_validated on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-images'
    and (select private.is_active_user())
    and private.is_validated_object(bucket_id, name)
  );

-- Files the cleanup-files job must remove (D18, D20 note: never lesson or submission files):
--   PENDING uploads older than pending_upload_expiry_hours, REJECTED objects, DELETE_FAILED retries,
--   and VALIDATED profile images that no profile points to any more (replaced or removed).
create function public.files_due_for_cleanup(p_limit integer default 100)
returns table (id uuid, bucket_name text, storage_path text, status public.file_status, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with expiry as (
    select coalesce((select (value)::text::int from public.system_settings where key = 'pending_upload_expiry_hours'), 24) as hours
  )
  select f.id, f.bucket_name, f.storage_path, f.status,
         case
           when f.status = 'PENDING' then 'expired_pending'
           when f.status = 'REJECTED' then 'rejected'
           when f.status = 'DELETE_FAILED' then 'retry'
           else 'replaced_profile_image'
         end
    from public.file_objects f, expiry e
   where (f.status = 'PENDING' and f.uploaded_at < now() - make_interval(hours => e.hours))
      or f.status in ('REJECTED', 'DELETE_FAILED')
      -- The only VALIDATED files ever removed here: profile images nobody uses any more.
      or (f.status = 'VALIDATED' and f.resource_type = 'PROFILE_IMAGE'
          and not exists (select 1 from public.profiles p where p.profile_image_file_id = f.id))
   order by f.uploaded_at
   limit greatest(1, least(p_limit, 500));
$$;

revoke execute on function public.files_due_for_cleanup(integer) from public, anon, authenticated;
grant execute on function public.files_due_for_cleanup(integer) to service_role;
