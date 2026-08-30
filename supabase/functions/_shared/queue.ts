/**
 * pgmq queue helpers for Edge Functions.
 *
 * pgmq (Postgres Message Queue) is available via the pgmq extension.
 * Workers dequeue with visibility timeout; BFF procedures enqueue.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type QueueName = 'q:scrape' | 'q:enrich' | 'q:analyze' | 'q:sync_keys';

/**
 * Enqueue a message to a pgmq queue.
 * Workers consume these as service_role.
 */
export const enqueue = async (
  supabase: SupabaseClient,
  queue: QueueName,
  message: Record<string, unknown>,
): Promise<number> => {
  const { data, error } = await supabase
    .rpc('enqueue_message', {
      p_queue_name: queue,
      p_message: message,
    })
    .single();
  if (error) throw new Error(`enqueue_message failed for ${queue}: ${error.message}`);
  return Number(data);
};

/**
 * Dequeue and archive a message with a visibility timeout (vt).
 * Returns null when the queue is empty.
 */
export const dequeue = async (
  supabase: SupabaseClient,
  queue: QueueName,
  _vtSeconds = 300,
): Promise<{
  msgId: number;
  readCt: number;
  enqueuedAt: string;
  vt: string;
  message: Record<string, unknown>;
} | null> => {
  const { data, error } = await supabase
    .rpc('dequeue_message', {
      p_queue_name: queue,
    })
    .single();
  if (error) throw new Error(`dequeue_message failed for ${queue}: ${error.message}`);
  if (!data) return null;

  const row = data as {
    msg_id: number;
    read_ct: number;
    enqueued_at: string;
    vt: string;
    message: Record<string, unknown>;
  };
  return {
    msgId: row.msg_id,
    readCt: row.read_ct,
    enqueuedAt: row.enqueued_at,
    vt: row.vt,
    message: row.message,
  };
};

/**
 * Archive (delete) a successfully processed message.
 */
export const archive = async (
  supabase: SupabaseClient,
  queue: QueueName,
  msgId: number,
): Promise<void> => {
  const { error } = await supabase.rpc('archive_message', {
    p_queue_name: queue,
    p_msg_id: msgId,
  });
  if (error) throw new Error(`archive_message failed for ${queue}: ${error.message}`);
};
