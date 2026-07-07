import { describe, it, expect } from 'vitest';
import { ErrorCode, SteadyFlowError, error } from './errors.js';

describe('ErrorCode', () => {
  it('accepts all defined codes', () => {
    const codes = [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION_FAILED',
      'RATE_LIMITED',
      'PROVIDER_ERROR',
      'PROVIDER_UNAVAILABLE',
      'KEY_MISSING',
      'KEY_INVALID',
      'ENVELOPE_DECRYPT_FAILED',
      'INTERNAL',
      'TIMEOUT',
    ] as const;
    for (const code of codes) {
      expect(ErrorCode.parse(code)).toBe(code);
    }
  });

  it('rejects unknown codes', () => {
    expect(() => ErrorCode.parse('UNKNOWN')).toThrow();
  });
});

describe('SteadyFlowError', () => {
  it('parses a minimal error', () => {
    const e = SteadyFlowError.parse({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Resource not found');
  });

  it('accepts optional details and requestId', () => {
    const e = SteadyFlowError.parse({
      code: 'VALIDATION_FAILED',
      message: 'Invalid input',
      details: { field: 'url' },
      requestId: '00000000-0000-0000-0000-000000000001',
    });
    expect(e.details).toEqual({ field: 'url' });
    expect(e.requestId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('rejects empty message', () => {
    expect(() =>
      SteadyFlowError.parse({ code: 'INTERNAL', message: '' }),
    ).toThrow();
  });

  it('rejects message over 2000 chars', () => {
    expect(() =>
      SteadyFlowError.parse({ code: 'INTERNAL', message: 'x'.repeat(2001) }),
    ).toThrow();
  });

  it('rejects invalid requestId', () => {
    expect(() =>
      SteadyFlowError.parse({
        code: 'INTERNAL',
        message: 'x',
        requestId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});

describe('error() helper', () => {
  it('constructs an error with code and message', () => {
    const e = error('NOT_FOUND', 'Shop not found');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('Shop not found');
    expect(e.details).toBeUndefined();
  });

  it('includes details when provided', () => {
    const e = error('VALIDATION_FAILED', 'Bad input', { field: 'url' });
    expect(e.details).toEqual({ field: 'url' });
  });

  it('omits details when undefined', () => {
    const e = error('INTERNAL', 'oops');
    expect('details' in e).toBe(false);
  });
});
