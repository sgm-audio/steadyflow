import { describe, it, expect } from 'vitest';
import { wrapKey, unwrapKey, wrapString, unwrapString, withUnwrappedKey } from './envelope.js';
import { deriveDekPbkdf2, randomSalt } from './dek.js';
import { zeroBuffer } from './zero.js';

const newDek = async (): Promise<Uint8Array> => {
  const { key } = await deriveDekPbkdf2('test-passphrase', randomSalt(), 1000);
  return key;
};

describe('envelope', () => {
  it('round-trips a key', async () => {
    const dek = await newDek();
    const pt = new TextEncoder().encode('sk-1234567890');
    const env = await wrapKey(dek, pt);
    const back = await unwrapKey(dek, env);
    expect(new TextDecoder().decode(back)).toBe('sk-1234567890');
    zeroBuffer(dek);
    zeroBuffer(pt);
    zeroBuffer(back);
  });

  it('round-trips a string', async () => {
    const dek = await newDek();
    const env = await wrapString(dek, 'hunter-api-key');
    expect(await unwrapString(dek, env)).toBe('hunter-api-key');
    zeroBuffer(dek);
  });

  it('produces different ciphertexts for same plaintext (random IV)', async () => {
    const dek = await newDek();
    const pt = new TextEncoder().encode('same');
    const a = await wrapKey(dek, pt);
    const b = await wrapKey(dek, pt);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    zeroBuffer(dek);
    zeroBuffer(pt);
  });

  it('rejects wrong DEK length', async () => {
    await expect(wrapKey(new Uint8Array(16), new Uint8Array(8))).rejects.toThrow(/32 bytes/);
  });

  it('withUnwrappedKey zeroes after use', async () => {
    const dek = await newDek();
    const env = await wrapString(dek, 'secret');
    let captured: Uint8Array | undefined;
    await withUnwrappedKey(dek, env, (k) => {
      // Capture a reference to the SAME buffer — zeroing the original
      // must zero what we see here.
      captured = k;
      return Promise.resolve(k.length);
    });
    expect(captured).toBeDefined();
    if (captured) {
      const allZero = captured.every((b) => b === 0);
      expect(allZero).toBe(true);
    }
    zeroBuffer(dek);
  });
});
