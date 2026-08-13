-- Phase A: Product findings — per-product audit rows so the UI can render
-- tables, not aggregated prose. One row per product per intent.
-- Superseded entries (prior analyses of the same store) are marked by the
-- worker so the UI only sees the latest analysis.
--
-- Store profiles — one row per analyzed store URL, dedup key.

create table public.product_findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  intent_id uuid not null references public.intents(id) on delete cascade,
  product_id text not null,
  handle text not null,
  title text not null,
  product_type text,
  vendor text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  margin_pct numeric(5,1),
  margin_cad numeric(10,2),
  cost_cad numeric(10,2),
  flags jsonb not null default '[]'::jsonb,
  red_flags smallint not null default 0,
  yellow_flags smallint not null default 0,
  description_words smallint,
  image_count smallint not null default 0,
  alt_count smallint not null default 0,
  variant_count smallint not null default 0,
  total_inventory integer,
  available_for_sale boolean,
  collection_count smallint not null default 0,
  seo_title_length smallint,
  seo_description_length smallint,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create index product_findings_intent_idx on product_findings (intent_id);
create index product_findings_org_url_idx on product_findings (org_id, handle);
-- Partial index — only latest (non-superseded) rows for UI queries
create index product_findings_latest_idx on product_findings (org_id, intent_id, superseded_at)
  where superseded_at is null;

alter table public.product_findings enable row level security;

create policy "product_findings_member_read"
  on public.product_findings for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (worker).

-- Store profiles — one row per analyzed URL, updated on each analysis.
create table public.store_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  url text not null,
  url_hash text not null unique,
  store_name text,
  currency text,
  product_count integer,
  collection_count integer,
  latest_intent_id uuid references public.intents(id) on delete set null,
  latest_report_id uuid references public.reports(id) on delete set null,
  latest_score smallint,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, url_hash)
);

create index store_profiles_org_idx on store_profiles (org_id, last_analyzed_at desc);

alter table public.store_profiles enable row level security;

create policy "store_profiles_member_read"
  on public.store_profiles for select
  to authenticated
  using (public.is_member_of(org_id));
