-- SteadyFlow initial schema
-- Migration: 0001_init
--
-- Conventions:
--   * Every table has RLS enabled.
--   * Every table has org_id (multi-tenant).
--   * audit_log is append-only (trigger blocks UPDATE/DELETE except by service_role).
--   * All timestamps are timestamptz in UTC.
--   * All IDs are uuid v4 (gen_random_uuid()).

create extension if not exists "pgcrypto";
create extension if not exists "pgmq";
create extension if not exists "pgsodium";

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: membership check used by every RLS policy.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.is_member_of(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- orgs
-- ──────────────────────────────────────────────────────────────────────────

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  default_llm_provider text not null default 'deepseek'
    check (default_llm_provider in ('deepseek','nvidia-nim','groq','openai-compatible')),
  default_llm_base_url text,
  default_llm_model text not null default 'deepseek-chat',
  llm_daily_budget_cents integer not null default 500 check (llm_daily_budget_cents >= 0),
  kdf_params jsonb not null default '{"algo":"argon2id","mem":19456,"t":2,"p":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orgs enable row level security;

create policy "orgs_select_member"
  on public.orgs for select
  to authenticated
  using (public.is_member_of(id));

create policy "orgs_insert_owner"
  on public.orgs for insert
  to authenticated
  with check (true); -- creator becomes owner via trigger below

create policy "orgs_update_member"
  on public.orgs for update
  to authenticated
  using (public.is_member_of(id))
  with check (public.is_member_of(id));

-- ──────────────────────────────────────────────────────────────────────────
-- memberships
-- ──────────────────────────────────────────────────────────────────────────

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table public.memberships enable row level security;

create policy "memberships_select_self_or_org"
  on public.memberships for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_member_of(org_id)
  );

create policy "memberships_insert_owner"
  on public.memberships for insert
  to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = memberships.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "memberships_update_owner"
  on public.memberships for update
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = memberships.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "memberships_delete_owner"
  on public.memberships for delete
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = memberships.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: when an org is created, add the creator as owner.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (org_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.orgs
  for each row execute function public.handle_new_org();

-- ──────────────────────────────────────────────────────────────────────────
-- keys_envelopes (BYOK)
-- ──────────────────────────────────────────────────────────────────────────

create table public.keys_envelopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  provider text not null check (provider in
    ('firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible')),
  -- AES-GCM ciphertext of the provider key, wrapped with the DEK
  wrapped_key bytea not null,
  iv bytea not null check (octet_length(iv) = 12),
  -- DEK, wrapped with the server KEK (pgsodium)
  dek_wrapped bytea not null,
  dek_salt bytea not null,
  kdf_params jsonb not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (org_id, provider)
);

alter table public.keys_envelopes enable row level security;

create policy "keys_envelopes_member_read"
  on public.keys_envelopes for select
  to authenticated
  using (public.is_member_of(org_id));

create policy "keys_envelopes_member_write"
  on public.keys_envelopes for insert
  to authenticated
  with check (public.is_member_of(org_id) and user_id = auth.uid());

create policy "keys_envelopes_member_update"
  on public.keys_envelopes for update
  to authenticated
  using (public.is_member_of(org_id))
  with check (public.is_member_of(org_id));

create policy "keys_envelopes_member_delete"
  on public.keys_envelopes for delete
  to authenticated
  using (public.is_member_of(org_id));

-- ──────────────────────────────────────────────────────────────────────────
-- intents
-- ──────────────────────────────────────────────────────────────────────────

create table public.intents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in
    ('analyze_shop','analyze_product','enrich_contact','monitor_competitor')),
  status text not null default 'queued' check (status in
    ('queued','running','succeeded','failed','cancelled','rate_limited')),
  input_hash text not null check (char_length(input_hash) = 64),
  idempotency_key text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index intents_org_status_idx on public.intents (org_id, status, created_at desc);
create index intents_user_idx on public.intents (user_id, created_at desc);

alter table public.intents enable row level security;

create policy "intents_member_read"
  on public.intents for select
  to authenticated
  using (public.is_member_of(org_id));

create policy "intents_member_insert"
  on public.intents for insert
  to authenticated
  with check (public.is_member_of(org_id) and user_id = auth.uid());

create policy "intents_member_update"
  on public.intents for update
  to authenticated
  using (public.is_member_of(org_id))
  with check (public.is_member_of(org_id));

-- ──────────────────────────────────────────────────────────────────────────
-- sources (scraped artifacts)
-- ──────────────────────────────────────────────────────────────────────────

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  intent_id uuid references public.intents(id) on delete set null,
  platform text not null check (platform in ('shopify','etsy','amazon')),
  url text not null,
  url_hash text not null check (char_length(url_hash) = 64),
  raw_markdown text,
  raw_html_path text, -- path in Supabase Storage
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index sources_org_idx on public.sources (org_id, captured_at desc);
create index sources_url_hash_idx on public.sources (url_hash);

alter table public.sources enable row level security;

create policy "sources_member_read"
  on public.sources for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (workers).

-- ──────────────────────────────────────────────────────────────────────────
-- insights
-- ──────────────────────────────────────────────────────────────────────────

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  intent_id uuid references public.intents(id) on delete set null,
  category text not null check (category in
    ('pricing','positioning','product_mix','marketing','seo','conversion','inventory','trend')),
  severity text not null check (severity in ('low','medium','high')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  citations jsonb not null default '[]'::jsonb,
  model text not null,
  provider text not null,
  generated_at timestamptz not null default now()
);

create index insights_org_idx on public.insights (org_id, generated_at desc);
create index insights_category_idx on public.insights (org_id, category);

alter table public.insights enable row level security;

create policy "insights_member_read"
  on public.insights for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (workers).

-- ──────────────────────────────────────────────────────────────────────────
-- audit_log (append-only)
-- ──────────────────────────────────────────────────────────────────────────

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  action text not null,
  outcome text not null check (outcome in ('success','error','rate_limited','cancelled')),
  input_hash text not null check (char_length(input_hash) = 64),
  provider text,
  duration_ms integer not null check (duration_ms >= 0),
  error_code text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (org_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;

create policy "audit_log_member_read"
  on public.audit_log for select
  to authenticated
  using (public.is_member_of(org_id));

-- Writes only via service_role (workers).
-- Append-only enforcement:
create or replace function public.audit_log_block_mutations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    if current_setting('role', true) = 'service_role' then
      return coalesce(new, old);
    end if;
    raise exception 'audit_log is append-only';
  end if;
  return new;
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutations();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutations();

-- ──────────────────────────────────────────────────────────────────────────
-- rate_limits (per-user token bucket)
-- ──────────────────────────────────────────────────────────────────────────

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  bucket text not null, -- e.g., 'firecrawl', 'llm.deepseek'
  tokens numeric not null default 0,
  refilled_at timestamptz not null default now(),
  unique (user_id, bucket)
);

alter table public.rate_limits enable row level security;

create policy "rate_limits_self_read"
  on public.rate_limits for select
  to authenticated
  using (user_id = auth.uid());

-- Writes only via service_role.

-- ──────────────────────────────────────────────────────────────────────────
-- devices (paired desktop/extension)
-- ──────────────────────────────────────────────────────────────────────────

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('desktop','extension','web')),
  name text not null,
  public_key text, -- for native messaging
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index devices_user_idx on public.devices (user_id);

alter table public.devices enable row level security;

create policy "devices_self_read"
  on public.devices for select
  to authenticated
  using (user_id = auth.uid() or public.is_member_of(org_id));

create policy "devices_self_write"
  on public.devices for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "devices_self_update"
  on public.devices for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "devices_self_delete"
  on public.devices for delete
  to authenticated
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- pgmq queues
-- ──────────────────────────────────────────────────────────────────────────

select pgmq.create('q:scrape');
select pgmq.create('q:enrich');
select pgmq.create('q:analyze');
select pgmq.create('q:sync_keys');

-- ──────────────────────────────────────────────────────────────────────────
-- Realtime publication (filtered by RLS automatically)
-- ──────────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.intents;
alter publication supabase_realtime add table public.insights;
alter publication supabase_realtime add table public.audit_log;
