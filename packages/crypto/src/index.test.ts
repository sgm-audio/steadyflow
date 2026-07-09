import { describe, it, expect } from 'vitest';
import { wrapProviderKey, unwrapProviderKey, DEFAULT_KDF_PARAMS } from './index.js';

describe('wrapProviderKey / unwrapProviderKey', () => {
  it('round-trips a provider key with the correct passphrase', async () => {
    const envelope = await wrapProviderKey('correct horse battery staple', 'sk-real-firecrawl-key-12345');
    const recovered = await unwrapProviderKey('correct horse battery staple', envelope);
    expect(recovered).toBe('sk-real-firecrawl-key-12345');
  });

  it('fails to unwrap with the wrong passphrase', async () => {
    const envelope = await wrapProviderKey('right-passphrase', 'sk-secret');
    await expect(unwrapProviderKey('wrong-passphrase', envelope)).rejects.toThrow();
  });

  it('never includes the passphrase or raw key in the envelope', async () => {
    const passphrase = 'never-leak-this-string';
    const rawKey = 'never-leak-this-key-either';
    const envelope = await wrapProviderKey(passphrase, rawKey);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(passphrase);
    expect(serialized).not.toContain(rawKey);
  });

  it('produces distinct ciphertext each time (random DEK + IV)', async () => {
    const a = await wrapProviderKey('pw', 'same-key');
    const b = await wrapProviderKey('pw', 'same-key');
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
    expect(a.dekWrapped).not.toBe(b.dekWrapped);
  });

  it('uses the default Argon2id parameters', async () => {
    const envelope = await wrapProviderKey('pw', 'key');
    expect(envelope.kdfParams).toEqual(DEFAULT_KDF_PARAMS);
  });
});
