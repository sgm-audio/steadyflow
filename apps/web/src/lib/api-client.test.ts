import { error } from '@steadyflow/core';
import { describe, expect, it } from 'vitest';
import { classifyError } from './api-client.js';

describe('classifyError', () => {
  it('maps authentication failures to the auth state', () => {
    expect(classifyError(error('UNAUTHENTICATED', 'no token'))).toBe('auth');
    expect(classifyError(error('FORBIDDEN', 'not a member'))).toBe('auth');
  });

  it('maps provider/key failures to provider-auth-failure', () => {
    const codes = [
      'KEY_MISSING',
      'KEY_INVALID',
      'PROVIDER_ERROR',
      'PROVIDER_UNAVAILABLE',
      'ENVELOPE_DECRYPT_FAILED',
    ] as const;
    for (const code of codes) {
      expect(classifyError(error(code, 'x'))).toBe('provider-auth-failure');
    }
  });

  it('maps rate limiting', () => {
    expect(classifyError(error('RATE_LIMITED', 'slow down'))).toBe('rate-limited');
  });

  it('maps not found', () => {
    expect(classifyError(error('NOT_FOUND', 'missing'))).toBe('not-found');
  });

  it('defaults to a generic error for anything else', () => {
    expect(classifyError(error('INTERNAL', 'boom'))).toBe('error');
    expect(classifyError(error('VALIDATION_FAILED', 'bad input'))).toBe('error');
    expect(classifyError(error('TIMEOUT', 'timed out'))).toBe('error');
  });
});
