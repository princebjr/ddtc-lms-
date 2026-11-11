-- Phase 11, migration 41 (ADR-019; owner answer 6 of 2026-11-10): a report downloaded as CSV is
-- recorded in the audit log (report.exported, with the report and its filters), as the audit log export
-- is. AAL2 administrators only.
create function public.report_export_record(p_kind text, p_filters jsonb) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only administrators export reports' using errcode = '42501';
  end if;
  if p_kind not in ('enrolment', 'activity', 'completion', 'grades') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  perform private.write_audit('report.exported', 'report', p_kind,
    jsonb_build_object('filters', case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end));
end;
$$;
revoke execute on function public.report_export_record(text, jsonb) from public, anon;
grant execute on function public.report_export_record(text, jsonb) to authenticated;
