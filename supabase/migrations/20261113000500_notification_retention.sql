-- Phase 15, migration 59: the approved retention schedule (docs/RETENTION_SCHEDULE.md, owner approval of
-- 2026-11-12, O21) removes notifications, their email delivery records and finished reminders after 2 years.
-- These are not educational records (D25 keeps grades, answers, history and audit logs); the audit log keeps who
-- was told what in its own entries. Runs daily at 03:20 (Ghana time) in batches; each run is audited with counts.
-- Anything still waiting to be sent (QUEUED, RETRYING, PENDING) is never removed.

/** Removes what the retention schedule says is old enough; returns the counts. */
create function private.purge_old_notifications(p_years integer default 2, p_batch integer default 5000) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - make_interval(years => greatest(p_years, 1));
  v_deliveries integer;
  v_notifications integer;
  v_reminders integer;
  v_ids uuid[];
begin
  -- The oldest notifications first, in a batch; none with an email still waiting to be sent.
  select coalesce(array_agg(o.id), '{}') into v_ids from (
    select n.id from public.notifications n
     where n.created_at < v_cut
       and not exists (select 1 from public.notification_deliveries d where d.notification_id = n.id and d.status in ('QUEUED', 'RETRYING'))
     order by n.created_at limit greatest(p_batch, 1)) o;
  -- Their email records first (they point at the notification), then the notifications.
  delete from public.notification_deliveries d where d.notification_id = any (v_ids);
  get diagnostics v_deliveries = row_count;
  delete from public.notifications n where n.id = any (v_ids);
  get diagnostics v_notifications = row_count;

  delete from public.notification_reminders r
   where r.status in ('SENT', 'CANCELLED') and r.updated_at < v_cut
     and r.id in (select id from public.notification_reminders where status in ('SENT', 'CANCELLED') and updated_at < v_cut limit greatest(p_batch, 1));
  get diagnostics v_reminders = row_count;

  if v_deliveries + v_notifications + v_reminders > 0 then
    perform private.write_audit('notifications.purged', 'notifications', null,
      jsonb_build_object('notifications', v_notifications, 'deliveries', v_deliveries, 'reminders', v_reminders, 'older_than_years', p_years));
  end if;
  return jsonb_build_object('notifications', v_notifications, 'deliveries', v_deliveries, 'reminders', v_reminders);
end;
$$;
revoke execute on function private.purge_old_notifications(integer, integer) from public, anon, authenticated;

select cron.schedule('notification-retention-daily', '20 3 * * *', 'select private.purge_old_notifications()');
