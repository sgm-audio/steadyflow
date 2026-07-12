-- Wire pg_cron + pg_net to periodically drain the pgmq job queues.
-- Migration: 0007_queue_scheduler
--
-- Without this, nothing invokes workers-scrape/workers-enrich/workers-analyze
-- outside of the local-only apps/edge/scripts/worker-loop.ts dev script --
-- queued intents just sit at status='queued'/'running' forever with no
-- error, since those workers only run when something calls them over HTTP.
--
-- The edge functions base URL + service_role key are read from Vault
-- secrets at call time rather than hardcoded here, since they differ
-- between local and hosted and the service_role key must not be committed.
-- Run supabase/scripts/setup-cron-secrets.sql once per project (local and
-- hosted) to populate them -- same pattern as setup-kek.sql. Until that's
-- run, invoke_edge_function() is a silent no-op and cron just retries next
-- tick.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_edge_function(p_function_name text)
returns void
language plpgsql
security definer
set search_path = vault, net, public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_functions_service_role_key';

  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

-- ponytail: 10s poll interval, same ballpark as worker-loop.ts's local
-- WORKER_POLL_MS=2000 default. Tighten via cron.alter_job if latency matters.
select cron.schedule('drain-q-scrape', '10 seconds', $$select public.invoke_edge_function('workers-scrape')$$);
select cron.schedule('drain-q-enrich', '10 seconds', $$select public.invoke_edge_function('workers-enrich')$$);
select cron.schedule('drain-q-analyze', '10 seconds', $$select public.invoke_edge_function('workers-analyze')$$);
