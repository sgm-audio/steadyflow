-- pgmq wrapper functions in public schema.
-- Migration: 0005_pgmq_wrappers
--
-- pgmq functions live in the pgmq schema, but Supabase's RPC and Edge Functions
-- need them in the public schema (or exposed via search_path). These wrappers
-- delegate to the pgmq functions so they're callable via supabase.rpc().

create or replace function public.enqueue_message(
  p_queue_name text,
  p_message jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pgmq, public
as $$
declare
  v_msg_id bigint;
begin
  select send into v_msg_id from pgmq.send(p_queue_name, p_message);
  return v_msg_id;
end;
$$;

create or replace function public.dequeue_message(
  p_queue_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pgmq, public
as $$
declare
  v_msg pgmq.message_record;
begin
  v_msg := pgmq.pop(p_queue_name);
  if v_msg.msg_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'msg_id', v_msg.msg_id,
    'read_ct', v_msg.read_ct,
    'enqueued_at', v_msg.enqueued_at,
    'vt', v_msg.vt,
    'message', v_msg.message
  );
end;
$$;

create or replace function public.archive_message(
  p_queue_name text,
  p_msg_id bigint
)
returns void
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  perform pgmq.archive(p_queue_name, p_msg_id);
end;
$$;

-- Grant execute to authenticated and service_role
grant execute on function public.enqueue_message(text, jsonb) to authenticated, service_role;
grant execute on function public.dequeue_message(text) to service_role;
grant execute on function public.archive_message(text, bigint) to service_role;
