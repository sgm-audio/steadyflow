-- Client-facing audit reports (PR 5 of the SteadyFlow v1 Scope Decision).
--
-- One report per intent, generated on demand from that intent's insights.
-- Per-finding enrichment (confidence/remediation/effort/access) is derived
-- at generation time from existing insight fields (category, severity,
-- citations, provider) rather than stored per-insight — it's a pure
-- function of data already on the row, so persisting it there would just
-- be denormalization with no benefit and a migration to keep in sync.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  intent_id uuid not null unique references public.intents(id) on delete cascade,
  executive_summary text not null check (char_length(executive_summary) between 1 and 4000),
  sprint_recommendation text not null check (char_length(sprint_recommendation) between 1 and 2000),
  finding_count integer not null default 0,
  generated_at timestamptz not null default now(),
  generated_by uuid not null references auth.users(id)
);

create index reports_org_idx on public.reports (org_id, generated_at desc);

alter table public.reports enable row level security;

create policy "reports_member_read"
  on public.reports for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (report-generate Edge Function).
