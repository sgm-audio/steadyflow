import { describe, expect, it } from 'vitest';
import {
  AmazonTimeoutError,
  DEFAULT_HTTP_TIMEOUT_MS,
  withTimeout,
} from './http.js';

describe('withTimeout — silent-failure guard', () => {
  it('rejects with AmazonTimeoutError when the underlying promise never resolves', async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout(never, 30)).rejects.toBeInstanceOf(AmazonTimeoutError);
  });

  it('rejects within the timeout window (no hang past 5s)', async () => {
    const never = new Promise<string>(() => undefined);
    const started = Date.now();
    await expect(withTimeout(never, 30)).rejects.toBeInstanceOf(AmazonTimeoutError);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });

  it('resolves when the underlying promise beats the timer', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 5000);
    expect(result).toBe('ok');
  });

  it('defaults to 5000ms', () => {
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(5000);
  });
});
