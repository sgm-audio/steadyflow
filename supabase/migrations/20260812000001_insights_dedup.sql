-- Phase A (v2) support: superseded_at on insights + category relax +
-- store-level dedup RPC.
--
-- The v2 catalog analysis emits insights in categories beyond the original
-- constraint (ai_agent_readiness, first_sale_math, channel_gap,
-- creator_playbook). Relax the check so those inserts don't fail.
--
-- Dedup: prior analyses of the same store are marked superseded so re-runs
-- don't double-list insights. Linkage is via intents.input_hash (SHA-256 of
-- JSON {platform,url} — the same value the worker computes).

alter table public.insights
  drop constraint if exists insights_category_check;

alter table public.insights
  add constraint insights_category_check check (
    category = any (array[
      'pricing','positioning','product_mix','marketing','seo','conversion',
      'inventory','trend','ai_agent_readiness','first_sale_math',
      'channel_gap','creator_playbook'
    ])
  );

alter table public.insights
  add column if not exists superseded_at timestamptz;

create index if not exists insights_org_superseded_idx
  on public.insights (org_id, superseded_at)
  where superseded_at is null;

-- Mark prior analyses of the same store (same input_hash) as superseded,
-- excluding the intent currently being analyzed. Supersedes both the
-- aggregated insights and the per-product findings rows.
create or replace function public.supersede_store_insights(
  p_org_id uuid,
  p_input_hash text,
  p_exclude_intent uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prior_intents uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_prior_intents
    from public.intents
   where org_id = p_org_id
     and input_hash = p_input_hash
     and id is distinct from p_exclude_intent;

  if array_length(v_prior_intents, 1) is null then
    return;
  end if;

  update public.insights
     set superseded_at = now()
   where org_id = p_org_id
     and intent_id = any (v_prior_intents)
     and superseded_at is null;

  update public.product_findings
     set superseded_at = now()
   where org_id = p_org_id
     and intent_id = any (v_prior_intents)
     and superseded_at is null;
end;
$$;
