-- Standing guard (CLAUDE.md section 3): every table in the public schema has RLS enabled.
-- Passes trivially in Phase 0 (no tables yet) and protects every later migration.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select has_schema('public', 'public schema exists');
select has_schema('auth', 'Supabase auth schema exists');

select is(
  (
    select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  '{}'::text[],
  'every table in public has row level security enabled'
);

select * from finish();
rollback;
