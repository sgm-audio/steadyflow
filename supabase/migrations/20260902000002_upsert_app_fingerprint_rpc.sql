-- RPC helper for app_fingerprints (B3 worker wiring).
--
-- Increments seen_count and updates last_seen_at on conflict, so repeated
-- audits of the same shop accumulate frequency data over time. service_role
-- only — the audit worker is the sole caller.
--
-- Schema:
--   unique (shop_domain, app_handle, detection_source)
--
-- Returns: number of rows written (1 on insert, 1 on update — upsert always
-- touches exactly one row).

create or replace function public.upsert_app_fingerprint(
  p_org_id uuid,
  p_shop_domain text,
  p_app_handle text,
  p_app_title text,
  p_detection_source text,
  p_category text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  insert into public.app_fingerprints (
    org_id,
    shop_domain,
    app_handle,
    app_title,
    detection_source,
    category,
    first_seen_at,
    last_seen_at,
    seen_count
  ) values (
    p_org_id,
    p_shop_domain,
    p_app_handle,
    p_app_title,
    p_detection_source,
    p_category,
    now(),
    now(),
    1
  )
  on conflict (shop_domain, app_handle, detection_source) do update
    set
      last_seen_at = now(),
      seen_count = public.app_fingerprints.seen_count + 1,
      app_title = excluded.app_title,
      category = excluded.category
  ;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
