-- Phase 13, migration 48 (rate-limit review): per-user limits on heavy actions, taken by the Edge Functions
-- (exports, bulk import, uploads, invitations, media deletion). Fixed windows: a user may take an action at
-- most p_max times per p_window_seconds; above that the function answers 429 and the screen shows "Too many
-- requests". Counts are operational data, not records: the daily clean removes counts older than a day.
-- Only the service role (the Edge Functions) may take or read them.

create table private.rate_limit_hits (
  actor uuid not null,
  action text not null check (char_length(action) between 1 and 64),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (actor, action, window_start)
);
create index rate_limit_hits_window_idx on private.rate_limit_hits (window_start);
alter table private.rate_limit_hits enable row level security;
revoke all on private.rate_limit_hits from public, anon, authenticated;

/** Counts one use of an action by a user; refuses with P0429 above p_max uses in the current window. */
create function public.rate_limit_take(p_actor uuid, p_action text, p_max integer, p_window_seconds integer) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if coalesce(p_max, 0) < 1 or coalesce(p_window_seconds, 0) < 1 then
    raise exception 'Give a limit and a window above 0' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limit_hits (actor, action, window_start, hits)
  values (p_actor, p_action, v_window, 1)
  on conflict (actor, action, window_start) do update set hits = private.rate_limit_hits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Too many requests. Try again in a few minutes.' using errcode = 'P0429';
  end if;
end;
$$;
revoke execute on function public.rate_limit_take(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(uuid, text, integer, integer) to service_role;

/** Removes counts older than a day (daily, by pg_cron). */
create function private.rate_limit_clean() returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.rate_limit_hits where window_start < now() - interval '1 day';
$$;
revoke execute on function private.rate_limit_clean() from public, anon, authenticated;

select cron.schedule('rate-limit-clean-daily', '10 3 * * *', 'select private.rate_limit_clean()');
