-- Phase B5 — score_history + app_fingerprints migrations.
--
-- Unblocks:
--   * S6 (recurring-audit diff) — score_history is the persistence layer the
--     worker will write one row per intent completion into. Reading the last N
--     rows per org gives the diff that powers "what changed since last audit".
--   * B3 (app fingerprints + sitemap-aware crawl) — app_fingerprints records
--     one row per detected Shopify app so the crawl step can fingerprint the
--     app landscape without re-scanning every page on every audit.
--
-- Both tables are append-only from the worker (service_role) and read-only
-- from authenticated members via RLS. Members see their org's rows only.

-- score_history --------------------------------------------------------------

create table public.score_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  intent_id uuid not null references public.intents(id) on delete cascade,
  shop_domain text not null check (char_length(shop_domain) between 1 and 253),
  total_score integer not null check (total_score between 0 and 200),
  grade text not null check (grade in ('A','B','C','D','F')),
  category_scores jsonb not null default '{}'::jsonb,
  critical_count integer not null default 0 check (critical_count >= 0),
  high_count integer not null default 0 check (high_count >= 0),
  medium_count integer not null default 0 check (medium_count >= 0),
  low_count integer not null default 0 check (low_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  -- rubric_version pins the scoring taxonomy so future rubric revisions
  -- don't silently mix apples and oranges in a single org's history.
  rubric_version text not null default 'v1',
  captured_at timestamptz not null default now(),
  unique (intent_id)
);

create index score_history_org_captured_idx
  on public.score_history (org_id, captured_at desc);
create index score_history_shop_captured_idx
  on public.score_history (shop_domain, captured_at desc);

alter table public.score_history enable row level security;

create policy "score_history_member_read"
  on public.score_history for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (workers-analyze). No UPDATE/DELETE policy on
-- purpose — history rows are immutable. Corrections go in via a new row.

-- app_fingerprints ------------------------------------------------------------

create table public.app_fingerprints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  shop_domain text not null check (char_length(shop_domain) between 1 and 253),
  app_handle text not null check (char_length(app_handle) between 1 and 128),
  app_title text not null check (char_length(app_title) between 1 and 200),
  detection_source text not null check (detection_source in
    ('theme_script','storefront_meta','sitemonitor','manual')),
  -- category is a free-form bucket — kept narrow but not enum-locked because
  -- the Shopify app taxonomy is not ours to lock.
  category text not null check (category in
    ('marketing','reviews','analytics','support','shipping','inventory','other')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1 check (seen_count >= 1),
  unique (shop_domain, app_handle, detection_source)
);

create index app_fingerprints_org_idx
  on public.app_fingerprints (org_id, last_seen_at desc);
create index app_fingerprints_shop_idx
  on public.app_fingerprints (shop_domain, last_seen_at desc);

alter table public.app_fingerprints enable row level security;

create policy "app_fingerprints_member_read"
  on public.app_fingerprints for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (workers-scrape).

-- Grants: default privileges on schema public (set in 0004_grants) cover new
-- tables, but we keep explicit grants next to the table for clarity and to
-- survive future default-privilege edits.
grant select on public.score_history to authenticated;
grant select on public.app_fingerprints to authenticated;
grant all on public.score_history to service_role;
grant all on public.app_fingerprints to service_role;
