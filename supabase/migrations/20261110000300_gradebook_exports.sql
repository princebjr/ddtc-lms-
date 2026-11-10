-- Phase 10, migration 32: what export-gradebook needs besides the gradebook reads. i_manage_course()
-- lets the function refuse anyone but the course's lecturers and AAL2 administrators before building a
-- file (learners never export, even their own row); record_export() writes the audit record for each
-- export (service role only, called after the caller is checked).

/** Whether the caller manages the course (its active lecturers and AAL2 administrators). */
create function public.i_manage_course(p_course uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_course(p_course);
$$;

revoke execute on function public.i_manage_course(uuid) from public, anon;
grant execute on function public.i_manage_course(uuid) to authenticated, service_role;

/** The audit record of a gradebook or assignment export (who, what, which format, how many rows). */
create function public.record_export(p_actor uuid, p_kind text, p_entity_type text, p_entity_id uuid, p_metadata jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind not in ('gradebook', 'assignment_report') then
    raise exception 'Unknown export' using errcode = '22023';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform private.write_audit('export.' || p_kind, p_entity_type, p_entity_id::text, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke execute on function public.record_export(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_export(uuid, text, text, uuid, jsonb) to service_role;
