/**
 * pgmq queue helpers for Edge Functions.
 *
 * pgmq (Postgres Message Queue) is available via the pgmq extension.
 * Workers dequeue with visibility timeout; BFF procedures enqueue.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
  const { data, error } = await supabase.rpc('pgmq.send', {
    queue_name: queue,
    msg: message,
  });
  if (error) throw new Error(`pgmq.send failed for ${queue}: ${error.message}`);
  return (data as { msg_id: number }).msg_id;
};

/**
 * Dequeue and archive a message with a visibility timeout (vt).
 * Returns null when the queue is empty.
 */
export const dequeue = async (
  supabase: SupabaseClient,
  queue: QueueName,
  vtSeconds = 300,
): Promise<{ msgId: number; readCt: number; enqueuedAt: string; vt: string; message: Record<string, unknown> } | null> => {
  const { data, error } = await supabase.rpc('pgmq.pop', {
    queue_name: queue,
  });
  if (error) throw new Error(`pgmq.pop failed for ${queue}: ${error.message}`);
  if (!data || (data as unknown[]).length === 0) return null;

  const row = (data as unknown[])[0] as {
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
  const { error } = await supabase.rpc('pgmq.archive', {
    queue_name: queue,
    msg_id: msgId,
  });
  if (error) throw new Error(`pgmq.archive failed for ${queue}: ${error.message}`);
};
