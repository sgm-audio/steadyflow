/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('redacts top-level secret keys', () => {
    expect(redactSecrets({ apiKey: 'sk-123', name: 'foo' })).toEqual({
      apiKey: '[REDACTED]',
      name: 'foo',
    });
  });

  it('redacts nested secret keys', () => {
    expect(redactSecrets({ outer: { token: 'abc', ok: true } })).toEqual({
      outer: { token: '[REDACTED]', ok: true },
    });
  });

  it('redacts inside arrays', () => {
    expect(redactSecrets([{ password: 'p1' }, { password: 'p2' }])).toEqual([
      { password: '[REDACTED]' },
      { password: '[REDACTED]' },
    ]);
  });

  it('is case-insensitive on key match', () => {
    expect(redactSecrets({ API_KEY: 'x', Authorization: 'y' })).toEqual({
      API_KEY: '[REDACTED]',
      Authorization: '[REDACTED]',
    });
  });

  it('passes through non-secret keys', () => {
    expect(redactSecrets({ url: 'https://x', count: 5 })).toEqual({
      url: 'https://x',
      count: 5,
    });
  });

  it('handles null/undefined', () => {
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(undefined)).toBe(undefined);
  });
});
