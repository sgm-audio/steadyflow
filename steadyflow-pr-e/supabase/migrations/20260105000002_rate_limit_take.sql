-- SteadyFlow rate limit RPC
-- Migration: 0002_rate_limit_take
--
-- Atomic check-and-decrement for per-user token bucket rate limiting.
-- Called from Edge Functions before any provider call.
--
-- Returns a row with:
--   allowed: boolean — whether the request is permitted
--   remaining: numeric — tokens left in the bucket after this call
--   retry_after_seconds: integer — seconds to wait if not allowed

create or replace function public.rate_limit_take(
  p_user_id uuid,
  p_org_id uuid,
  p_bucket text,
  p_capacity integer,
  p_refill_per_second numeric
)
returns table (
  allowed boolean,
  remaining numeric,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_existing record;
  v_tokens numeric;
  v_elapsed interval;
  v_refilled numeric;
  v_take numeric := 1;
  v_remaining numeric;
  v_retry_after integer;
begin
  -- Lock the row for this user+bucket to make the check-and-decrement atomic.
  select * into v_existing
  from public.rate_limits
  where user_id = p_user_id and bucket = p_bucket
  for update;

  if not found then
    -- First request for this bucket — create the row at full capacity minus 1.
    insert into public.rate_limits (user_id, org_id, bucket, tokens, refilled_at)
    values (p_user_id, p_org_id, p_bucket, p_capacity - v_take, v_now);

    return query select true, p_capacity - v_take, 0;
    return;
  end if;

  -- Compute elapsed time since last refill.
  v_elapsed := v_now - v_existing.refilled_at;
  v_refilled := least(
    p_capacity,
    v_existing.tokens + (extract(epoch from v_elapsed) * p_refill_per_second)
  );

  if v_refilled >= v_take then
    -- Allowed: take one token.
    v_remaining := v_refilled - v_take;
    update public.rate_limits
    set tokens = v_remaining, refilled_at = v_now
    where user_id = p_user_id and bucket = p_bucket;

    return query select true, v_remaining, 0;
    return;
  else
    -- Denied: compute retry-after based on how long until one token is available.
    v_retry_after := ceil((v_take - v_refilled) / p_refill_per_second)::integer;
    if v_retry_after < 1 then v_retry_after := 1; end if;

    -- Still update refilled_at so the next call sees the latest state.
    update public.rate_limits
    set tokens = v_refilled, refilled_at = v_now
    where user_id = p_user_id and bucket = p_bucket;

    return query select false, v_refilled, v_retry_after;
    return;
  end if;
end;
$$;

-- Only service_role can call this RPC (workers and Edge Functions).
-- Authenticated users cannot bypass the rate limiter by calling it directly.
revoke execute on function public.rate_limit_take(uuid, uuid, text, integer, numeric) from public;
grant execute on function public.rate_limit_take(uuid, uuid, text, integer, numeric) to service_role;
