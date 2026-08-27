-- SteadyFlow table-level permissions
-- Migration: 0004_grants
--
-- RLS policies restrict rows; table-level GRANTs restrict operations.
-- Every table needs explicit GRANTs for each role that accesses it.

-- authenticated users: can interact with their own data via RLS
grant select on public.orgs to authenticated;
grant select, insert, update on public.memberships to authenticated;
grant select, insert, update on public.intents to authenticated;
grant select on public.sources to authenticated;
grant select on public.insights to authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update, delete on public.keys_envelopes to authenticated;
grant select on public.rate_limits to authenticated;
grant select, insert, update, delete on public.devices to authenticated;

-- service_role: full access for workers and Edge Functions
grant all on public.orgs to service_role;
grant all on public.memberships to service_role;
grant all on public.intents to service_role;
grant all on public.sources to service_role;
grant all on public.insights to service_role;
grant all on public.audit_log to service_role;
grant all on public.keys_envelopes to service_role;
grant all on public.rate_limits to service_role;
grant all on public.devices to service_role;

-- anon: no access (all data requires authentication)
-- (default — no grants needed)

-- Ensure future tables get proper grants via default privileges.
-- These apply to tables created by postgres in the public schema.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
