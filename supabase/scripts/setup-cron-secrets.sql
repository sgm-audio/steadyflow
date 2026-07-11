-- Queue scheduler secrets for SteadyFlow.
-- Run this ONCE per Supabase project (local and production).
--
-- Migration 20260111000007_queue_scheduler.sql schedules pg_cron jobs that
-- call the workers-scrape/workers-enrich/workers-analyze edge functions over
-- HTTP via pg_net. Those calls need a base URL + service_role key, which
-- can't live in a migration (differs per environment, and the key must
-- never be committed). This script puts them in Vault, where
-- invoke_edge_function() reads them at call time.
--
-- Usage (local):
--   podman exec supabase_db_steadyflow psql -U postgres -d postgres \
--     -v url="'http://kong:8000'" \
--     -v key="'<local service_role key from `supabase status`>'" \
--     -f supabase/scripts/setup-cron-secrets.sql
--   (Inside the db container, use the `kong` service name, not
--   127.0.0.1:54321 -- that's only reachable from the host.)
--
-- Usage (hosted):
--   Run in Supabase Dashboard -> SQL Editor, with :url set to
--   'https://<project-ref>.supabase.co' and :key set to the project's
--   service_role key (Settings -> API).

select vault.create_secret(:url, 'edge_functions_url');
select vault.create_secret(:key, 'edge_functions_service_role_key');
