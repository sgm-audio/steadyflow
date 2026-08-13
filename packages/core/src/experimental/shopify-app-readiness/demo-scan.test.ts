import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runShopifyAppReadinessScan } from './integration';

const DOCS_DIR = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'experimental', 'shopify-app-readiness');

describe('Shopify App Readiness — end-to-end scan', () => {
  beforeAll(() => {
    process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
  });

  it('runs a full scan and writes the report', async () => {
    const result = await runShopifyAppReadinessScan(
      {
        appId: '123e4567-e89b-12d3-a456-426614174000',
        appMetadata: {
          name: 'SteadyFlow Validation App',
          description: 'Internal pilot app validating Shopify App Store readiness checks',
          version: '0.1.0',
          apiVersion: '2026-07',
          embedded: true,
          scopes: ['read_products', 'write_orders'],
          privacyPolicyUrl: 'https://steadyflow.dev/privacy',
          supportUrl: 'https://steadyflow.dev/support',
          webhooks: [{ topic: 'orders/create', address: 'https://steadyflow.dev/webhook' }],
          extensions: [{ type: 'theme_app_extension', handle: 'steadyflow-theme' }],
        },
        scanConfig: {
          commitSha: '0123456789abcdef0123456789abcdef01234567',
          scannedBy: 'validation@steadyflow.dev',
          includeHtml: true,
        },
        manualReviews: [
          {
            requirementId: 'embedded-app',
            requirementVersion: '1.0.0',
            reviewerId: 'validation@steadyflow.dev',
            reviewerName: 'SteadyFlow Validation',
            decision: 'approved',
            evidence: [],
            applicabilityDecision: 'applicable',
            applicabilityReason: 'Embedded public app',
            reviewedAt: new Date().toISOString(),
          },
        ],
      },
      { organizationId: '22222222-2222-2222-2222-222222222222', actorId: '11111111-1111-1111-1111-111111111111' }
    );

    expect(result.status).toBe('completed');
    expect(result.reportId).toBeTruthy();
    expect(result.reportJson).toBeTruthy();
    expect(result.reportMarkdown).toBeTruthy();

    mkdirSync(DOCS_DIR, { recursive: true });
    if (result.reportJson) writeFileSync(join(DOCS_DIR, 'SAMPLE_REPORT.json'), result.reportJson);
    if (result.reportMarkdown) writeFileSync(join(DOCS_DIR, 'SAMPLE_REPORT.md'), result.reportMarkdown);
    if (result.reportHtml) writeFileSync(join(DOCS_DIR, 'SAMPLE_REPORT.html'), result.reportHtml);
  });
});
