import { describe, expect, it } from 'vitest';
import {
  checkApiScopeExtraction,
  checkConfigurationParsing,
  checkDeprecatedApiDetection,
  checkDirectMutationFlags,
  checkEmbeddedAppDetection,
  checkExternalDependencyInventory,
  checkHardcodedDevelopmentUrls,
  checkNameDescriptionExtraction,
  checkOAuthInstallationDetection,
  checkPrivacySupportUrls,
  checkSecretLikeValueDetection,
  checkThemeExtensionChecks,
  checkWebhookIdentification,
  runStaticChecks,
} from './checks';
import { getShopifyAppRequirements } from './registry';
import type { ShopifyAppRequirement } from './schema';

describe('Static Readiness Checks', () => {
  const requirements = getShopifyAppRequirements();

  const findReq = (id: string): ShopifyAppRequirement => {
    const found = requirements.find((r) => r.id === id);
    if (!found) throw new Error(`Requirement not found: ${id}`);
    return found;
  };

  const baseConfig = {
    name: 'Test App',
    description: 'A test app for Shopify',
    privacyPolicyUrl: 'https://example.com/privacy',
    supportUrl: 'https://example.com/support',
    scopes: ['read_products', 'write_orders'],
    webhooks: [{ topic: 'orders/create', address: 'https://example.com/webhook' }],
    extensions: [],
    embeddedApp: true,
    oauth: { redirectUris: ['https://example.com/auth/callback'] },
    developmentUrls: [],
    mutations: [],
    externalDependencies: ['stripe', 'sendgrid'],
    themeExtensions: [{ name: 'My Theme Block', handle: 'my-theme-block' }],
  };

  describe('Individual check functions', () => {
    it('checkConfigurationParsing passes with valid object', () => {
      const req = findReq('config-parsing');
      const result = checkConfigurationParsing(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkConfigurationParsing fails with null', () => {
      const req = findReq('config-parsing');
      const result = checkConfigurationParsing(null, req);
      expect(result.status).toBe('fail');
    });

    it('checkApiScopeExtraction passes with minimal scopes', () => {
      const req = findReq('api-scopes');
      const result = checkApiScopeExtraction({ ...baseConfig, scopes: ['read_products'] }, req);
      expect(result.status).toBe('pass');
    });

    it('checkApiScopeExtraction warns on excessive scopes', () => {
      const req = findReq('api-scopes');
      const result = checkApiScopeExtraction(
        { ...baseConfig, scopes: ['read_products', 'write_all_data'] },
        req,
      );
      expect(result.status).toBe('warning');
    });

    it('checkDeprecatedApiDetection passes with clean config', () => {
      const req = findReq('deprecated-api');
      const result = checkDeprecatedApiDetection(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkDeprecatedApiDetection fails on deprecated patterns', () => {
      const req = findReq('deprecated-api');
      const config = { ...baseConfig, customField: '/admin/api/2022-07/products.json' };
      const result = checkDeprecatedApiDetection(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkOAuthInstallationDetection passes with valid HTTPS URIs', () => {
      const req = findReq('oauth-installation');
      const result = checkOAuthInstallationDetection(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkOAuthInstallationDetection fails on HTTP redirect', () => {
      const req = findReq('oauth-installation');
      const config = { ...baseConfig, oauth: { redirectUris: ['http://localhost/callback'] } };
      const result = checkOAuthInstallationDetection(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkEmbeddedAppDetection returns manual_review when embedded', () => {
      const req = findReq('embedded-app');
      const result = checkEmbeddedAppDetection(baseConfig, req);
      expect(result.status).toBe('manual_review');
    });

    it('checkEmbeddedAppDetection returns not_applicable when not embedded', () => {
      const req = findReq('embedded-app');
      const result = checkEmbeddedAppDetection({ ...baseConfig, embeddedApp: false }, req);
      expect(result.status).toBe('not_applicable');
    });

    it('checkThemeExtensionChecks passes with valid handles', () => {
      const req = findReq('theme-extension');
      const result = checkThemeExtensionChecks(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkThemeExtensionChecks fails on missing handle', () => {
      const req = findReq('theme-extension');
      const config = { ...baseConfig, themeExtensions: [{ name: 'Block', handle: '' }] };
      const result = checkThemeExtensionChecks(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkDirectMutationFlags passes with no mutations', () => {
      const req = findReq('direct-mutations');
      const result = checkDirectMutationFlags(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkDirectMutationFlags warns on mutations', () => {
      const req = findReq('direct-mutations');
      const config = { ...baseConfig, mutations: ['directDBWrite'] };
      const result = checkDirectMutationFlags(config, req);
      expect(result.status).toBe('warning');
    });

    it('checkPrivacySupportUrls passes with both URLs', () => {
      const req = findReq('privacy-support-urls');
      const result = checkPrivacySupportUrls(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkPrivacySupportUrls fails when missing', () => {
      const req = findReq('privacy-support-urls');
      const config = { ...baseConfig, privacyPolicyUrl: undefined };
      const result = checkPrivacySupportUrls(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkNameDescriptionExtraction passes with both fields', () => {
      const req = findReq('name-description');
      const result = checkNameDescriptionExtraction(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkNameDescriptionExtraction fails when missing', () => {
      const req = findReq('name-description');
      const config = { ...baseConfig, name: '' };
      const result = checkNameDescriptionExtraction(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkHardcodedDevelopmentUrls passes with clean URLs', () => {
      const req = findReq('dev-urls');
      const result = checkHardcodedDevelopmentUrls(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkHardcodedDevelopmentUrls fails on localhost', () => {
      const req = findReq('dev-urls');
      const config = { ...baseConfig, developmentUrls: ['https://localhost:3000'] };
      const result = checkHardcodedDevelopmentUrls(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkSecretLikeValueDetection passes with no secrets', () => {
      const req = findReq('secret-detection');
      const result = checkSecretLikeValueDetection(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkSecretLikeValueDetection fails on API key pattern', () => {
      const req = findReq('secret-detection');
      const config = { ...baseConfig, apiKey: 'sk_live_123456789012345678901234' };
      const result = checkSecretLikeValueDetection(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkWebhookIdentification passes with valid webhooks', () => {
      const req = findReq('webhook-identification');
      const result = checkWebhookIdentification(baseConfig, req);
      expect(result.status).toBe('pass');
    });

    it('checkWebhookIdentification fails on missing fields', () => {
      const req = findReq('webhook-identification');
      const config = { ...baseConfig, webhooks: [{ topic: '', address: 'https://x.com' }] };
      const result = checkWebhookIdentification(config, req);
      expect(result.status).toBe('fail');
    });

    it('checkExternalDependencyInventory passes', () => {
      const req = findReq('external-deps');
      const result = checkExternalDependencyInventory(baseConfig, req);
      expect(result.status).toBe('pass');
    });
  });

  describe('runStaticChecks orchestrator', () => {
    it('returns results for all requirements', () => {
      const results = runStaticChecks(baseConfig, requirements);
      expect(results.length).toBe(requirements.length);
      expect(results.every((r) => typeof r.status === 'string')).toBe(true);
    });

    it('marks unknown for requirements without checkers', () => {
      const extraReq: ShopifyAppRequirement = {
        id: 'non-existent',
        title: 'X',
        description: 'X',
        category: 'other',
        severity: 'warning',
        validationMode: 'manual',
        applicability: [],
        officialSourceUrl: 'https://example.com',
        officialSourceTitle: 'X',
        verifiedAt: '2026-08-02T00:00:00Z',
      };
      const results = runStaticChecks(baseConfig, [extraReq]);
      expect(results[0]?.status).toBe('unknown');
    });
  });
});
