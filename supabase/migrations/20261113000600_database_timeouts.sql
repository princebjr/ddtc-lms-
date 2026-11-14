-- Phase 15 (D45 stability), migration 60: database time limits for every role the app uses.
--   * idle_in_transaction_session_timeout 60 s: a connection left open in the middle of a transaction (a crashed
--     worker, a dropped client) is closed and its locks released, instead of holding them indefinitely.
--   * service_role statement_timeout 60 s: the Edge Functions' role had none; a runaway query in a background job
--     now stops after a minute. Exports and the nightly jobs run well inside it (docs/CAPACITY.md timings).
-- Unchanged (Supabase's defaults): anon 3 s and authenticated 8 s per statement; authenticator lock_timeout 8 s.
-- A role's settings apply to connections opened after the change (the pooler reconnects within minutes).

alter role anon set idle_in_transaction_session_timeout = '60s';
alter role authenticated set idle_in_transaction_session_timeout = '60s';
alter role authenticator set idle_in_transaction_session_timeout = '60s';
alter role service_role set idle_in_transaction_session_timeout = '60s';
alter role service_role set statement_timeout = '60s';
