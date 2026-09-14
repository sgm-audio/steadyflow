export class AmazonTimeoutError extends Error {
  constructor(message: string) {
    super(`[commerce/amazon] ${message}`);
    this.name = 'AmazonTimeoutError';
  }
}

/** Silent-failure guard: no Amazon HTTP call may hang longer than this. */
export const DEFAULT_HTTP_TIMEOUT_MS = 5000;

/**
 * Reject with AmazonTimeoutError if `p` does not settle within `timeoutMs`.
 * Used on every Amazon HTTP call so a stalled socket surfaces loudly instead
 * of hanging the worker pipeline past 5 seconds.
 */
export function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AmazonTimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
