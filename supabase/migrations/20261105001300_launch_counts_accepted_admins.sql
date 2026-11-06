-- Phase 4, migration 13 (ADR-003): administrators can be invited by email. An invited
-- administrator counts towards the two-administrator launch rule (D32) only once they have accepted
-- the invitation, which confirms their email address.

create or replace function public.launch_readiness() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('active_admins', n, 'ok', n >= 2)
    from (
      select count(*)::int as n
        from public.profiles p
        join auth.users u on u.id = p.id
       where p.role = 'ADMIN' and p.account_status = 'ACTIVE' and u.email_confirmed_at is not null
    ) s;
$$;
