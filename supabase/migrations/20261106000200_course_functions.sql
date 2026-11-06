-- Phase 5, migration 15: the trusted course functions (SECURITY_AND_ACCESS.md section 8; D04 to
-- D07, ADR-005). Edge Functions verify the caller and call these with the service role, passing
-- p_as_admin = true only after am_i_admin() succeeded with the caller's own token (AAL2 and the D32
-- limits). Each function re-checks the actor, makes the change and writes the audit record in one
-- transaction. Clients cannot call them.

-- ---------------------------------------------------------------- actor checks
/** The actor as an administrator (p_as_admin) or as an ACTIVE lecturer. Returns the role. */
create function private.require_course_actor(p_actor uuid, p_as_admin boolean) returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_as_admin then
    perform private.require_admin_actor(p_actor);
    return 'ADMIN';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor and role = 'LECTURER' and account_status = 'ACTIVE') then
    raise exception 'The acting user is not an active lecturer' using errcode = '42501';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  return 'LECTURER';
end;
$$;

/** The actor's current permission on a course, or null. */
create function private.course_permission_of(p_course uuid, p_user uuid) returns public.course_permission
language sql
stable
security definer
set search_path = ''
as $$
  select permission_level from public.course_lecturers
   where course_id = p_course and lecturer_id = p_user and removed_at is null;
$$;

revoke execute on function private.require_course_actor(uuid, boolean), private.course_permission_of(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- create-course
-- A lecturer with can_create_courses creates a course they own. An administrator creates a course
-- for any ACTIVE lecturer, who becomes OWNER.
create function public.course_create(
  p_actor uuid,
  p_as_admin boolean,
  p_owner uuid,
  p_title text,
  p_code text,
  p_description text default '',
  p_objectives text default '',
  p_category text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.require_course_actor(p_actor, p_as_admin);
  v_id uuid;
begin
  if v_role = 'LECTURER' then
    if not exists (select 1 from public.profiles where id = p_actor and can_create_courses) then
      raise exception 'You are not allowed to create courses' using errcode = '42501';
    end if;
    if p_owner is distinct from p_actor then
      raise exception 'A lecturer can only create a course they own' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.profiles where id = p_owner and role = 'LECTURER' and account_status = 'ACTIVE') then
    raise exception 'Choose an active lecturer as the course owner' using errcode = '22023';
  end if;

  insert into public.courses (title, course_code, description, learning_objectives, category, created_by)
  values (p_title, p_code, coalesce(p_description, ''), coalesce(p_objectives, ''), coalesce(p_category, ''), p_actor)
  returning id into v_id;

  insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
  values (v_id, p_owner, 'OWNER', p_actor);

  perform private.write_audit('course.created', 'course', v_id::text,
    jsonb_build_object('owner', p_owner, 'course_code', upper(btrim(p_code))));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- course-lifecycle (D04, D07, ADR-005)
-- submit    lecturer of the course, DRAFT -> PENDING_APPROVAL, or PUBLISHED when approval is off
--           or the lecturer may publish directly
-- publish   administrator, DRAFT or PENDING_APPROVAL -> PUBLISHED
-- approve   administrator, PENDING_APPROVAL -> PUBLISHED; p_grant_direct also lets the lecturer who
--           submitted it publish directly from now on
-- return    administrator, PENDING_APPROVAL -> DRAFT with a reason
-- archive   administrator or OWNER, any -> ARCHIVED (read-only; nothing deleted)
-- unarchive administrator or OWNER (Undo), ARCHIVED -> PUBLISHED if it was published, else DRAFT
create function public.course_transition(
  p_actor uuid,
  p_as_admin boolean,
  p_course uuid,
  p_action text,
  p_reason text default null,
  p_grant_direct boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.require_course_actor(p_actor, p_as_admin);
  v_course public.courses;
  v_perm public.course_permission;
  v_status public.course_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_approval boolean;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  v_perm := private.course_permission_of(p_course, p_actor);
  if v_role = 'LECTURER' and v_perm is null then
    raise exception 'You do not teach this course' using errcode = '42501';
  end if;

  case p_action
    when 'submit' then
      if v_role <> 'LECTURER' then
        raise exception 'Administrators publish with "publish"' using errcode = '22023';
      end if;
      if v_course.status <> 'DRAFT' then
        raise exception 'Only a draft can be submitted' using errcode = '22023';
      end if;
      v_approval := coalesce((select value = 'true'::jsonb from public.system_settings where key = 'require_course_approval'), true)
                    and not (select can_publish_directly from public.profiles where id = p_actor);
      v_status := case when v_approval then 'PENDING_APPROVAL' else 'PUBLISHED' end;
      update public.courses
         set status = v_status, submitted_by = p_actor, submitted_at = now(),
             published_at = case when v_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end,
             return_reason = case when v_status = 'PUBLISHED' then null else return_reason end
       where id = p_course;
      perform private.write_audit(case when v_approval then 'course.submitted' else 'course.published' end, 'course', p_course::text, '{}');

    when 'publish', 'approve' then
      if v_role <> 'ADMIN' then
        raise exception 'Only an administrator can approve or publish this course' using errcode = '42501';
      end if;
      if p_action = 'approve' and v_course.status <> 'PENDING_APPROVAL'
         or p_action = 'publish' and v_course.status not in ('DRAFT', 'PENDING_APPROVAL') then
        raise exception 'This course cannot be published from its current status' using errcode = '22023';
      end if;
      v_status := 'PUBLISHED';
      update public.courses
         set status = 'PUBLISHED', published_at = coalesce(published_at, now()), return_reason = null
       where id = p_course;
      perform private.write_audit(case when p_action = 'approve' then 'course.approved' else 'course.published' end,
        'course', p_course::text, jsonb_build_object('grant_direct', p_grant_direct));
      if p_grant_direct and v_course.submitted_by is not null then
        update public.profiles set can_publish_directly = true
         where id = v_course.submitted_by and role = 'LECTURER';
      end if;

    when 'return' then
      if v_role <> 'ADMIN' then
        raise exception 'Only an administrator can return a course' using errcode = '42501';
      end if;
      if v_course.status <> 'PENDING_APPROVAL' then
        raise exception 'Only a course waiting for approval can be returned' using errcode = '22023';
      end if;
      if v_reason is null or char_length(v_reason) < 3 then
        raise exception 'Give the lecturer a reason' using errcode = '22023';
      end if;
      v_status := 'DRAFT';
      update public.courses set status = 'DRAFT', return_reason = left(v_reason, 1000) where id = p_course;
      perform private.write_audit('course.returned', 'course', p_course::text, jsonb_build_object('reason', left(v_reason, 1000)));

    when 'archive' then
      if v_role = 'LECTURER' and v_perm <> 'OWNER' then
        raise exception 'Only the course owner or an administrator can archive' using errcode = '42501';
      end if;
      if v_course.status = 'ARCHIVED' then
        raise exception 'This course is already archived' using errcode = '22023';
      end if;
      v_status := 'ARCHIVED';
      update public.courses set status = 'ARCHIVED', archived_at = now() where id = p_course;
      perform private.write_audit('course.archived', 'course', p_course::text, jsonb_build_object('previous', v_course.status));

    when 'unarchive' then
      if v_role = 'LECTURER' and v_perm <> 'OWNER' then
        raise exception 'Only the course owner or an administrator can restore' using errcode = '42501';
      end if;
      if v_course.status <> 'ARCHIVED' then
        raise exception 'This course is not archived' using errcode = '22023';
      end if;
      v_status := case when v_course.published_at is not null then 'PUBLISHED' else 'DRAFT' end;
      update public.courses set status = v_status, archived_at = null where id = p_course;
      perform private.write_audit('course.unarchived', 'course', p_course::text, jsonb_build_object('status', v_status));

    else
      raise exception 'Unknown action' using errcode = '22023';
  end case;

  return jsonb_build_object('id', p_course, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- course-lecturers (D06)
-- add       administrator or OWNER: a CO_LECTURER (reopens a removed row)
-- remove    administrator or OWNER: closes a CO_LECTURER row (kept as history)
-- transfer  administrator: the lecturer becomes OWNER; the previous OWNER stays as CO_LECTURER
create function public.course_lecturer_change(
  p_actor uuid,
  p_as_admin boolean,
  p_course uuid,
  p_lecturer uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := private.require_course_actor(p_actor, p_as_admin);
  v_course public.courses;
  v_target public.course_lecturers;
  v_old_owner uuid;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  if v_role = 'LECTURER' then
    if private.course_permission_of(p_course, p_actor) is null then
      raise exception 'You do not teach this course' using errcode = '42501';
    end if;
    if p_action = 'transfer' or private.course_permission_of(p_course, p_actor) <> 'OWNER' then
      raise exception 'Only the course owner or an administrator can manage lecturers' using errcode = '42501';
    end if;
  end if;
  if v_course.status = 'ARCHIVED' and p_action <> 'transfer' then
    raise exception 'This course is archived' using errcode = '22023';
  end if;

  select * into v_target from public.course_lecturers where course_id = p_course and lecturer_id = p_lecturer for update;

  case p_action
    when 'add' then
      if not exists (select 1 from public.profiles where id = p_lecturer and role = 'LECTURER' and account_status = 'ACTIVE') then
        raise exception 'Only an active lecturer can teach a course' using errcode = '22023';
      end if;
      if v_target.id is not null and v_target.removed_at is null then
        raise exception 'This lecturer already teaches the course' using errcode = '22023';
      end if;
      if v_target.id is null then
        insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
        values (p_course, p_lecturer, 'CO_LECTURER', p_actor);
      else
        update public.course_lecturers
           set permission_level = 'CO_LECTURER', removed_at = null, removed_by = null, assigned_by = p_actor, assigned_at = now()
         where id = v_target.id;
      end if;
      perform private.write_audit('course.lecturer_added', 'course', p_course::text, jsonb_build_object('lecturer', p_lecturer));

    when 'remove' then
      if v_target.id is null or v_target.removed_at is not null then
        raise exception 'This lecturer does not teach the course' using errcode = '22023';
      end if;
      if v_target.permission_level = 'OWNER' then
        raise exception 'Transfer ownership before removing the owner' using errcode = '22023';
      end if;
      update public.course_lecturers set removed_at = now(), removed_by = p_actor where id = v_target.id;
      perform private.write_audit('course.lecturer_removed', 'course', p_course::text, jsonb_build_object('lecturer', p_lecturer));

    when 'transfer' then
      if not exists (select 1 from public.profiles where id = p_lecturer and role = 'LECTURER' and account_status = 'ACTIVE') then
        raise exception 'Choose an active lecturer as the new owner' using errcode = '22023';
      end if;
      select lecturer_id into v_old_owner from public.course_lecturers
       where course_id = p_course and permission_level = 'OWNER' and removed_at is null for update;
      if v_old_owner = p_lecturer then
        raise exception 'This lecturer already owns the course' using errcode = '22023';
      end if;
      update public.course_lecturers set permission_level = 'CO_LECTURER'
       where course_id = p_course and lecturer_id = v_old_owner;
      if v_target.id is null then
        insert into public.course_lecturers (course_id, lecturer_id, permission_level, assigned_by)
        values (p_course, p_lecturer, 'OWNER', p_actor);
      else
        update public.course_lecturers
           set permission_level = 'OWNER', removed_at = null, removed_by = null, assigned_by = p_actor, assigned_at = now()
         where id = v_target.id;
      end if;
      perform private.write_audit('course.owner_transferred', 'course', p_course::text,
        jsonb_build_object('from', v_old_owner, 'to', p_lecturer));

    else
      raise exception 'Unknown action' using errcode = '22023';
  end case;

  return jsonb_build_object('course', p_course, 'lecturer', p_lecturer, 'action', p_action);
end;
$$;

-- ---------------------------------------------------------------- manage-enrolments (D05)
-- Administrator only. Learners already enrolled (any status but WITHDRAWN) are skipped.
create function public.enrolment_add(p_actor uuid, p_course uuid, p_learners uuid[]) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.course_status;
  v_learner uuid;
  v_id uuid;
  v_enrolled uuid[] := '{}';
  v_skipped int := 0;
begin
  perform private.require_admin_actor(p_actor);
  select status into v_status from public.courses where id = p_course for share;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  if v_status = 'ARCHIVED' then
    raise exception 'An archived course takes no new enrolments' using errcode = '22023';
  end if;
  if coalesce(array_length(p_learners, 1), 0) = 0 or array_length(p_learners, 1) > 500 then
    raise exception 'Choose between 1 and 500 learners' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_learners) u(id)
     where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'LEARNER' and p.account_status <> 'DEACTIVATED')
  ) then
    raise exception 'Only learners can be enrolled' using errcode = '22023';
  end if;

  foreach v_learner in array (select array_agg(distinct x) from unnest(p_learners) x) loop
    if exists (select 1 from public.course_enrollments
                where course_id = p_course and learner_id = v_learner and enrolment_status <> 'WITHDRAWN') then
      v_skipped := v_skipped + 1;
    else
      insert into public.course_enrollments (course_id, learner_id, enrolled_by)
      values (p_course, v_learner, p_actor)
      returning id into v_id;
      v_enrolled := v_enrolled || v_id;
      perform private.write_audit('enrolment.added', 'enrolment', v_id::text,
        jsonb_build_object('course', p_course, 'learner', v_learner));
    end if;
  end loop;

  return jsonb_build_object('enrolled', to_jsonb(v_enrolled), 'skipped', v_skipped);
end;
$$;

-- Administrator only. Returns each enrolment's previous status so the app can offer Undo.
create function public.enrolment_set_status(p_actor uuid, p_enrolments uuid[], p_status public.enrolment_status) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.course_enrollments;
  v_result jsonb := '[]';
begin
  perform private.require_admin_actor(p_actor);
  if coalesce(array_length(p_enrolments, 1), 0) = 0 or array_length(p_enrolments, 1) > 500 then
    raise exception 'Choose between 1 and 500 enrolments' using errcode = '22023';
  end if;
  for v_row in select * from public.course_enrollments where id = any (p_enrolments) for update loop
    if v_row.enrolment_status <> p_status then
      update public.course_enrollments
         set enrolment_status = p_status, status_changed_at = now(), status_changed_by = p_actor
       where id = v_row.id;
      perform private.write_audit('enrolment.status_changed', 'enrolment', v_row.id::text,
        jsonb_build_object('old_status', v_row.enrolment_status, 'new_status', p_status));
    end if;
    v_result := v_result || jsonb_build_object('id', v_row.id, 'previous', v_row.enrolment_status);
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------- direct publishing (ADR-005)
create function public.admin_set_direct_publish(p_actor uuid, p_target uuid, p_value boolean) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_actor(p_actor);
  if not exists (select 1 from public.profiles where id = p_target and role = 'LECTURER') then
    raise exception 'Only lecturers can publish directly' using errcode = '22023';
  end if;
  update public.profiles set can_publish_directly = coalesce(p_value, false) where id = p_target;
  return jsonb_build_object('id', p_target, 'can_publish_directly', coalesce(p_value, false));
end;
$$;

-- ---------------------------------------------------------------- deactivating a lecturer
-- Same as Phase 4, plus: a lecturer who owns a course that is not archived cannot be deactivated
-- or moved to another role until an administrator transfers ownership; their co-lecturer places
-- are then closed (rows kept, D25).
create or replace function public.admin_set_user(
  p_actor uuid,
  p_target uuid,
  p_role public.user_role default null,
  p_status public.account_status default null,
  p_can_create boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
  v_role public.user_role;
  v_status public.account_status;
  v_can_create boolean;
  v_revoked int := 0;
  v_owned int;
begin
  perform private.require_admin_actor(p_actor);
  if p_actor = p_target and (p_role is not null or p_status is not null) then
    -- No self-change: an administrator cannot lock themselves out, and since the actor is an
    -- active administrator, the target can never be the last one.
    raise exception 'Administrators cannot change their own role or status' using errcode = '42501';
  end if;

  select * into v_old from public.profiles where id = p_target for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  v_role := coalesce(p_role, v_old.role);
  v_status := coalesce(p_status, v_old.account_status);
  v_can_create := case when v_role = 'LECTURER' then coalesce(p_can_create, v_old.can_create_courses) else false end;
  if p_can_create is true and v_role <> 'LECTURER' then
    raise exception 'Only lecturers can be allowed to create courses' using errcode = '22023';
  end if;

  -- A lecturer leaving teaching (deactivated, or another role) must hand over the courses they own.
  if v_old.role = 'LECTURER' and (v_role <> 'LECTURER' or (v_status = 'DEACTIVATED' and v_old.account_status <> 'DEACTIVATED')) then
    select count(*) into v_owned
      from public.course_lecturers cl join public.courses c on c.id = cl.course_id
     where cl.lecturer_id = p_target and cl.permission_level = 'OWNER' and cl.removed_at is null and c.status <> 'ARCHIVED';
    if v_owned > 0 then
      raise exception 'Transfer the % course(s) this lecturer owns first', v_owned using errcode = 'P0409';
    end if;
    update public.course_lecturers set removed_at = now(), removed_by = p_actor
     where lecturer_id = p_target and permission_level = 'CO_LECTURER' and removed_at is null;
  end if;

  update public.profiles
     set role = v_role, account_status = v_status, can_create_courses = v_can_create,
         can_publish_directly = case when v_role = 'LECTURER' then can_publish_directly else false end
   where id = p_target;

  -- Suspension and deactivation revoke every session at once (D32). Existing access tokens expire
  -- within an hour; RLS already refuses them because the account is no longer ACTIVE.
  if v_status <> 'ACTIVE' and v_old.account_status = 'ACTIVE' then
    delete from auth.sessions where user_id = p_target;
    get diagnostics v_revoked = row_count;
    perform private.write_audit('admin.sessions_revoked', 'profile', p_target::text, jsonb_build_object('sessions', v_revoked));
  end if;

  -- Staff sign in with email and password only (D27): promotion removes any Google identity.
  if v_role in ('ADMIN', 'LECTURER') and v_old.role = 'LEARNER' then
    delete from auth.identities where user_id = p_target and provider = 'google';
  end if;

  return jsonb_build_object('id', p_target, 'role', v_role, 'account_status', v_status, 'can_create_courses', v_can_create);
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke execute on function
  public.course_create(uuid, boolean, uuid, text, text, text, text, text),
  public.course_transition(uuid, boolean, uuid, text, text, boolean),
  public.course_lecturer_change(uuid, boolean, uuid, uuid, text),
  public.enrolment_add(uuid, uuid, uuid[]),
  public.enrolment_set_status(uuid, uuid[], public.enrolment_status),
  public.admin_set_direct_publish(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.course_create(uuid, boolean, uuid, text, text, text, text, text),
  public.course_transition(uuid, boolean, uuid, text, text, boolean),
  public.course_lecturer_change(uuid, boolean, uuid, uuid, text),
  public.enrolment_add(uuid, uuid, uuid[]),
  public.enrolment_set_status(uuid, uuid[], public.enrolment_status),
  public.admin_set_direct_publish(uuid, uuid, boolean)
  to service_role;
