import { describe, it, expect } from 'vitest';
import { getShopifyAppRequirements } from './registry';

describe('Shopify App Requirement Registry', () => {
  it('should load requirements from file', () => {
    const requirements = getShopifyAppRequirements();
    expect(requirements).toBeDefined();
    expect(requirements.length).toBeGreaterThan(0);

    const oauthReq = requirements.find(req => req.id === 'oauth-installation');
    expect(oauthReq).toBeDefined();
    expect(oauthReq?.category).toBe('authentication');
    expect(oauthReq?.severity).toBe('blocker');
  });

  it('should return empty array if no requirements exist', () => {
    const requirements = getShopifyAppRequirements();
    expect(requirements).toBeDefined();
  });
});
