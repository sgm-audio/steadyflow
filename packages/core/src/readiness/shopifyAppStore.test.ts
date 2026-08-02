import { describe, expect, it } from 'vitest';
import { ReadinessRequirement } from './schemas.js';
import { SHOPIFY_APP_STORE_BASELINE_REQUIREMENTS } from './shopifyAppStore.js';

describe('SHOPIFY_APP_STORE_BASELINE_REQUIREMENTS', () => {
  it('uses unique requirements with official sources and verification dates', () => {
    const parsed = SHOPIFY_APP_STORE_BASELINE_REQUIREMENTS.map((item) => ReadinessRequirement.parse(item));
    expect(new Set(parsed.map(({ id }) => id)).size).toBe(parsed.length);
    for (const item of parsed) {
      expect(new URL(item.source.url).hostname).toBe('shopify.dev');
      expect(item.source.lastVerifiedOn).toBe('2026-08-02');
    }
  });
  it('separates automatic checks from manual review', () => {
    expect(new Set(SHOPIFY_APP_STORE_BASELINE_REQUIREMENTS.map(({ verificationMode }) => verificationMode))).toEqual(new Set(['automatic', 'manual']));
  });
});
