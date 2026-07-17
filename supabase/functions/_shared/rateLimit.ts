// Per-user token bucket rate limiter.
// Backed by the rate_limits table; only service_role writes.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface RateLimitConfig {
  bucket: string;
  /** Max tokens in the bucket. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  firecrawl: { bucket: 'firecrawl', capacity: 60, refillPerSecond: 1 },
  tavily: { bucket: 'tavily', capacity: 30, refillPerSecond: 0.5 },
  'llm.deepseek': { bucket: 'llm.deepseek', capacity: 120, refillPerSecond: 2 },
  'llm.nvidia-nim': { bucket: 'llm.nvidia-nim', capacity: 60, refillPerSecond: 1 },
  'llm.groq': { bucket: 'llm.groq', capacity: 60, refillPerSecond: 1 },
  'llm.openai-compatible': { bucket: 'llm.openai-compatible', capacity: 60, refillPerSecond: 1 },
};

export const getRateLimitConfig = (bucket: string): RateLimitConfig => {
  return DEFAULTS[bucket] ?? { bucket, capacity: 30, refillPerSecond: 0.5 };
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Atomic check-and-decrement. Uses a SECURITY DEFINER RPC.
 * Returns allowed=false when the bucket is empty.
 */
export const checkRateLimit = async (
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  bucket: string,
): Promise<RateLimitResult> => {
  const cfg = getRateLimitConfig(bucket);
  const { data, error } = await supabase.rpc('rate_limit_take', {
    p_user_id: userId,
    p_org_id: orgId,
    p_bucket: cfg.bucket,
    p_capacity: cfg.capacity,
    p_refill_per_second: cfg.refillPerSecond,
  }).single();
  if (error) {
    // Fail closed on infra errors.
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
  const result = data as { allowed: boolean; remaining: number; retry_after_seconds: number } | null;
  if (!result) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: result.retry_after_seconds,
  };
};
