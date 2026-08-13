import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runShopifyAppReadinessScan, getFeatureFlagStatus, ShopifyAppReadinessInputSchema } from './integration';

describe('Shopify App Readiness Integration', () => {
  const originalEnv = process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Feature Flag', () => {
    it('getFeatureFlagStatus returns disabled when env var not set', () => {
      delete process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED;
      const status = getFeatureFlagStatus();
      expect(status.enabled).toBe(false);
    });

    it('getFeatureFlagStatus returns false when env var is "false"', () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'false';
      const status = getFeatureFlagStatus();
      expect(status.enabled).toBe(false);
    });

    it('getFeatureFlagStatus returns true when env var is "true"', () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
      const status = getFeatureFlagStatus();
      expect(status.enabled).toBe(true);
    });
  });

  describe('Input Schema Validation', () => {
    const validInput = {
      appId: '123e4567-e89b-12d3-a456-426614174000',
      appMetadata: {
        name: 'Test App',
        description: 'A test app',
        version: '1.0.0',
        apiVersion: '2026-07',
        embedded: true,
        scopes: ['read_products'],
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
      },
      scanConfig: {
        commitSha: 'a'.repeat(40),
        scannedBy: 'test@example.com',
        includeHtml: false,
      },
      manualReviews: [],
    };

    it('accepts valid input', () => {
      const result = ShopifyAppReadinessInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid appId (not UUID)', () => {
      const input = { ...validInput, appId: 'not-a-uuid' };
      const result = ShopifyAppReadinessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid commitSha (wrong length)', () => {
      const input = { ...validInput, scanConfig: { ...validInput.scanConfig, commitSha: 'short' } };
      const result = ShopifyAppReadinessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid email for scannedBy', () => {
      const input = { ...validInput, scanConfig: { ...validInput.scanConfig, scannedBy: 'not-email' } };
      const result = ShopifyAppReadinessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const input = { ...validInput, appMetadata: { ...validInput.appMetadata, name: '' } };
      const result = ShopifyAppReadinessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid URL for privacyPolicyUrl', () => {
      const input = { ...validInput, appMetadata: { ...validInput.appMetadata, privacyPolicyUrl: 'not-a-url' } };
      const result = ShopifyAppReadinessInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('runShopifyAppReadinessScan', () => {
    const baseContext = { organizationId: '22222222-2222-2222-2222-222222222222', actorId: '11111111-1111-1111-1111-111111111111' };
    const validInput = {
      appId: '123e4567-e89b-12d3-a456-426614174000',
      appMetadata: {
        name: 'Test App',
        description: 'A test app for Shopify',
        version: '1.0.0',
        apiVersion: '2026-07',
        embedded: true,
        scopes: ['read_products', 'write_orders'],
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
        webhooks: [{ topic: 'orders/create', address: 'https://example.com/webhook' }],
        extensions: [{ type: 'theme_app_extension', handle: 'my-theme' }],
      },
      scanConfig: {
        commitSha: 'a'.repeat(40),
        scannedBy: 'test@example.com',
        includeHtml: false,
      },
      manualReviews: [],
    };

    it('returns failed when feature flag is disabled', async () => {
      delete process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED;
      const result = await runShopifyAppReadinessScan(validInput, baseContext);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('disabled');
    });

    it('returns failed when input validation fails', async () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
      const invalidInput = { ...validInput, appId: 'invalid' };
      const result = await runShopifyAppReadinessScan(invalidInput, baseContext);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid input');
    });

    it('returns failed with feature disabled message when flag is false', async () => {
      delete process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED;
      const result = await runShopifyAppReadinessScan(validInput, baseContext);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('disabled');
    });

    it('completes successfully when feature enabled and input valid', async () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
      const result = await runShopifyAppReadinessScan(validInput, baseContext);
      expect(result.status).toBe('completed');
      expect(result.reportId).toBeDefined();
      expect(result.reportJson).toBeDefined();
      expect(result.reportMarkdown).toBeDefined();
      expect(result.reportHtml).toBeUndefined(); // includeHtml is false
    });

    it('includes HTML when includeHtml is true', async () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
      const inputWithHtml = { ...validInput, scanConfig: { ...validInput.scanConfig, includeHtml: true } };
      const result = await runShopifyAppReadinessScan(inputWithHtml, baseContext);
      expect(result.status).toBe('completed');
      expect(result.reportHtml).toBeDefined();
      expect(result.reportHtml).toContain('<!DOCTYPE html>');
    });

    it('accepts manual reviews in input', async () => {
      process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
      const inputWithReviews = {
        ...validInput,
        manualReviews: [{
          requirementId: 'embedded-app',
          requirementVersion: '1.0.0',
          reviewerId: 'reviewer@example.com',
          reviewerName: 'John Reviewer',
          decision: 'approved' as const,
          evidence: [],
          applicabilityDecision: 'applicable' as const,
          reviewedAt: new Date().toISOString(),
        }],
      };
      const result = await runShopifyAppReadinessScan(inputWithReviews, baseContext);
      expect(result.status).toBe('completed');
    });
  });
});