import { describe, expect, it } from 'vitest';
import { computeInputHash, hashObject, stableStringify } from './hash.js';

describe('computeInputHash', () => {
  it('produces 64-char lowercase hex', () => {
    const h = computeInputHash('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeInputHash('x')).toBe(computeInputHash('x'));
  });

  it('differs for different inputs', () => {
    expect(computeInputHash('a')).not.toBe(computeInputHash('b'));
  });

  it('matches known SHA-256 vector', () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(computeInputHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('stableStringify', () => {
  it('sorts keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('handles nested objects', () => {
    expect(stableStringify({ a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1}}');
  });

  it('handles arrays in order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles null', () => {
    expect(stableStringify(null)).toBe('null');
  });

  it('handles primitives', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('s')).toBe('"s"');
    expect(stableStringify(true)).toBe('true');
  });
});

describe('hashObject', () => {
  it('is order-independent', () => {
    expect(hashObject({ a: 1, b: 2 })).toBe(hashObject({ b: 2, a: 1 }));
  });

  it('differs for different values', () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 2 }));
  });
});
