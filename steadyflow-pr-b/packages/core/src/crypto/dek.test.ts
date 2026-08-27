import { describe, it, expect } from 'vitest';
import { deriveDekPbkdf2, randomSalt, DEFAULT_KDF_PARAMS } from './dek.js';

describe('randomSalt', () => {
  it('produces a salt of the requested length', () => {
    const salt = randomSalt(16);
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('produces different salts on each call', () => {
    const a = randomSalt();
    const b = randomSalt();
    expect(a).not.toEqual(b);
  });
});

describe('DEFAULT_KDF_PARAMS', () => {
  it('uses argon2id with OWASP 2024 defaults', () => {
    expect(DEFAULT_KDF_PARAMS.algo).toBe('argon2id');
    expect(DEFAULT_KDF_PARAMS.mem).toBe(19456);
    expect(DEFAULT_KDF_PARAMS.t).toBe(2);
    expect(DEFAULT_KDF_PARAMS.p).toBe(1);
  });
});

describe('deriveDekPbkdf2', () => {
  it('derives a 32-byte key', async () => {
    const salt = randomSalt();
    const { key } = await deriveDekPbkdf2('test-passphrase', salt, 1000);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('produces the same key for the same passphrase and salt', async () => {
    const salt = randomSalt();
    const a = await deriveDekPbkdf2('same-passphrase', salt, 1000);
    const b = await deriveDekPbkdf2('same-passphrase', salt, 1000);
    expect(a.key).toEqual(b.key);
  });

  it('produces different keys for different passphrases', async () => {
    const salt = randomSalt();
    const a = await deriveDekPbkdf2('passphrase-a', salt, 1000);
    const b = await deriveDekPbkdf2('passphrase-b', salt, 1000);
    expect(a.key).not.toEqual(b.key);
  });

  it('produces different keys for different salts', async () => {
    const a = await deriveDekPbkdf2('same-passphrase', randomSalt(), 1000);
    const b = await deriveDekPbkdf2('same-passphrase', randomSalt(), 1000);
    expect(a.key).not.toEqual(b.key);
  });
});
