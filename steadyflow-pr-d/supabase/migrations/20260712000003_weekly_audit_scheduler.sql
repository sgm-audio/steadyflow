-- Weekly full-audit automation: extends the pg_cron/pg_net wiring from
-- 20260111000007_queue_scheduler.sql (drain-q-scrape/enrich/analyze) with a
-- drain for the new q:monitor queue, plus a weekly job that enqueues a fresh
-- analyze_shop + monitor_competitor intent for every org that's actually
-- ready for it -- so monitoring happens without manually resubmitting a URL.

-- The org's own Shopify store domain, needed to run analyze_shop
-- automatically (the manual "Analyze a shop" form supplies this ad hoc;
-- automation needs it persisted). Nullable: most orgs won't have this set.
alter table public.orgs add column shopify_store_url text;

select cron.schedule('drain-q-monitor', '10 seconds', $$select public.invoke_edge_function('workers-monitor')$$);

create or replace function public.enqueue_weekly_audit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
  v_owner_id uuid;
  v_intent_id uuid;
  v_competitor record;
  v_week text := to_char(now(), 'IYYY-IW');
begin
  for v_org in
    select o.id, o.shopify_store_url
    from public.orgs o
    where o.shopify_store_url is not null
      and exists (
        select 1 from public.keys_envelopes k
        where k.org_id = o.id and k.provider = 'shopify-admin'
      )
  loop
    select m.user_id into v_owner_id
    from public.memberships m
    where m.org_id = v_org.id and m.role = 'owner'
    limit 1;

    if v_owner_id is null then
      continue;
    end if;

    insert into public.intents (org_id, user_id, kind, status, input_hash, idempotency_key)
    values (
      v_org.id, v_owner_id, 'analyze_shop', 'queued',
      encode(digest(v_org.id::text || v_week, 'sha256'), 'hex'),
      'weekly-audit-' || v_week
    )
    on conflict (org_id, idempotency_key) do nothing
    returning id into v_intent_id;

    if v_intent_id is not null then
      perform public.enqueue_message('q:scrape', jsonb_build_object(
        'intentId', v_intent_id,
        'orgId', v_org.id,
        'url', v_org.shopify_store_url,
        'platform', 'shopify'
      ));
    end if;

    for v_competitor in select id from public.competitors where org_id = v_org.id loop
      v_intent_id := null;

      insert into public.intents (org_id, user_id, kind, status, input_hash, idempotency_key)
      values (
        v_org.id, v_owner_id, 'monitor_competitor', 'queued',
        encode(digest(v_competitor.id::text || v_week, 'sha256'), 'hex'),
        'weekly-monitor-' || v_competitor.id::text || '-' || v_week
      )
      on conflict (org_id, idempotency_key) do nothing
      returning id into v_intent_id;

      if v_intent_id is not null then
        perform public.enqueue_message('q:monitor', jsonb_build_object(
          'intentId', v_intent_id,
          'orgId', v_org.id,
          'competitorId', v_competitor.id
        ));
      end if;
    end loop;
  end loop;
end;
$$;

select cron.schedule('weekly-full-audit', '0 8 * * 1', $$select public.enqueue_weekly_audit()$$);
