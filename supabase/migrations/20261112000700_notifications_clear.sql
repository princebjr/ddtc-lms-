-- Owner request of 2026-11-12 (ADR-024), migration 53: clear notifications one at a time or all at once.
--   * notifications.cleared_at: when the person cleared it. A cleared notification is kept (never deleted), counts
--     as read, and leaves their list and their unread count; Undo clears cleared_at again.
--   * notifications_clear(ids): clears the caller's own notifications, all of them when ids is null, setting
--     read_at too where it was empty (a read time already recorded stays). Returns the ids cleared, for Undo.
--   * notifications_restore(ids): brings back the caller's own cleared notifications. Returns the ids restored.
-- Both act only on rows whose recipient is the caller, whatever ids are passed.

alter table public.notifications add column cleared_at timestamptz;
create index notifications_recipient_visible_idx on public.notifications (recipient_id, created_at desc) where cleared_at is null;

create function public.notifications_clear(p_ids uuid[] default null) returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_active_user() then
    raise exception 'Sign in to clear notifications' using errcode = '42501';
  end if;
  return query
  update public.notifications n
     set cleared_at = now(), read_at = coalesce(n.read_at, now())
   where n.recipient_id = (select auth.uid()) and n.cleared_at is null
     and (p_ids is null or n.id = any (p_ids))
  returning n.id;
end;
$$;

create function public.notifications_restore(p_ids uuid[]) returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_active_user() then
    raise exception 'Sign in to restore notifications' using errcode = '42501';
  end if;
  return query
  update public.notifications n
     set cleared_at = null
   where n.recipient_id = (select auth.uid()) and n.cleared_at is not null and n.id = any (coalesce(p_ids, '{}'))
  returning n.id;
end;
$$;

revoke execute on function public.notifications_clear(uuid[]), public.notifications_restore(uuid[]) from public, anon;
grant execute on function public.notifications_clear(uuid[]), public.notifications_restore(uuid[]) to authenticated;
