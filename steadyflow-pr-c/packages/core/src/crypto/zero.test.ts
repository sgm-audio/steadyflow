import { describe, it, expect } from 'vitest';
import { zeroBuffer } from './zero.js';

describe('zeroBuffer', () => {
  it('zeroes a Uint8Array in place', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    zeroBuffer(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0]);
  });

  it('handles an already-zero buffer', () => {
    const buf = new Uint8Array(10);
    zeroBuffer(buf);
    expect(Array.from(buf)).toEqual(new Array(10).fill(0));
  });

  it('handles an empty buffer', () => {
    const buf = new Uint8Array(0);
    zeroBuffer(buf);
    expect(buf.length).toBe(0);
  });
});
