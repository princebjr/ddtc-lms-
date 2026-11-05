-- Phase 4, migration 11: run cleanup-files every hour (SECURITY_AND_ACCESS.md section 8, D18).
-- pg_cron calls the Edge Function through pg_net with the project URL and the service-role key,
-- both read from Supabase Vault at run time; nothing secret is stored in this migration or the
-- repository. Each environment adds the two Vault secrets once (docs/RUNBOOK.md, "Scheduled jobs").
-- Until they exist the job does nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.call_cleanup_files() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
  if v_url is null or v_key is null then
    return; -- not configured in this environment yet
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/cleanup-files',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function private.call_cleanup_files() from public, anon, authenticated;

select cron.schedule('cleanup-files-hourly', '17 * * * *', 'select private.call_cleanup_files()');
