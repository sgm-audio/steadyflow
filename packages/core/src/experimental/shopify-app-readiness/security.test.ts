import { describe, it, expect } from 'vitest';
import { getShopifyAppRequirements } from './registry';
import type { ShopifyAppRequirement } from './schema';
import type { ReadinessCheckResult, AppConfiguration } from './checks';
import {
  checkConfigurationParsing,
  checkOAuthInstallationDetection,
  checkHardcodedDevelopmentUrls,
  checkDirectMutationFlags,
  checkExternalDependencyInventory,
} from './checks';
import {
  generateReadinessReport,
  reportToHtml,
  reportToMarkdown,
  reportToJson,
  computeReportHash,
  type ReadinessReport,
  type AppMetadata,
  type ScanMetadata,
} from './report-generator';
import {
  runShopifyAppReadinessScan,
  ShopifyAppReadinessInputSchema,
  type AuditEvent,
  type AuditWriter,
} from './integration';

const findReq = (id: string): ShopifyAppRequirement => {
  const found = getShopifyAppRequirements().find(r => r.id === id);
  if (!found) throw new Error(`Requirement not found: ${id}`);
  return found;
};

const baseAppMetadata: AppMetadata = {
  name: 'Test App',
  description: 'A test app',
  version: '1.0.0',
  apiVersion: '2026-07',
  embedded: true,
  scopes: ['read_products'],
};

const baseScanMetadata: ScanMetadata = {
  scanTimestamp: '2026-08-02T15:00:00Z',
  commitSha: 'a'.repeat(40),
  scannerVersion: '0.1.0',
  scannedBy: 'test@example.com',
};

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
  },
  scanConfig: {
    commitSha: 'a'.repeat(40),
    scannedBy: 'test@example.com',
    includeHtml: false,
  },
};

const validContext = {
  organizationId: '22222222-2222-2222-2222-222222222222',
  actorId: '11111111-1111-1111-1111-111111111111',
};

describe('Security: HTML injection (reportToHtml)', () => {
  it('escapes script/markup in user-controlled app name', () => {
    const report = generateReadinessReport({
      appMetadata: { ...baseAppMetadata, name: '<script>alert("xss")</script>' },
      scanMetadata: baseScanMetadata,
      staticCheckResults: [],
      manualReviewResults: [],
    });
    const html = reportToHtml(report);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes angle brackets in description', () => {
    const report = generateReadinessReport({
      appMetadata: { ...baseAppMetadata, description: '<img src=x onerror=alert(1)>' },
      scanMetadata: baseScanMetadata,
      staticCheckResults: [],
      manualReviewResults: [],
    });
    const html = reportToHtml(report);
    expect(html).not.toContain('<img src=x onerror');
  });
});

describe('Security: secret leakage', () => {
  it('checkConfigurationParsing does not echo raw config into evidence', () => {
    const result = checkConfigurationParsing(
      { clientSecret: 'SUPERSECRET', apiKey: 'KEY123', name: 'x' },
      findReq('config-parsing')
    );
    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain('SUPERSECRET');
    expect(serialized).not.toContain('KEY123');
  });

  it('reportToMarkdown redacts secret-shaped evidence values', () => {
    const secretEvidence: ReadinessCheckResult = {
      requirementId: 'config-parsing',
      status: 'pass',
      message: 'ok',
      evidence: { token: 'SEKRET-TOKEN-VALUE' },
    };
    const report = generateReadinessReport({
      appMetadata: baseAppMetadata,
      scanMetadata: baseScanMetadata,
      staticCheckResults: [secretEvidence],
      manualReviewResults: [],
    });
    const md = reportToMarkdown(report);
    expect(md).not.toContain('SEKRET-TOKEN-VALUE');
    expect(md).toContain('[REDACTED]');
  });

  it('reportToJson redacts secret-shaped evidence values', () => {
    const secretEvidence: ReadinessCheckResult = {
      requirementId: 'config-parsing',
      status: 'pass',
      message: 'ok',
      evidence: { password: 'HUNTER2' },
    };
    const report = generateReadinessReport({
      appMetadata: baseAppMetadata,
      scanMetadata: baseScanMetadata,
      staticCheckResults: [secretEvidence],
      manualReviewResults: [],
    });
    const json = reportToJson(report);
    expect(json).not.toContain('HUNTER2');
  });
});

describe('Security: false-negative (dead checks report honestly)', () => {
  const emptyConfig: AppConfiguration = { name: 'x', description: 'y' };

  it('checkOAuthInstallationDetection returns not_applicable when oauth absent', () => {
    const result = checkOAuthInstallationDetection(emptyConfig, findReq('oauth-installation'));
    expect(result.status).toBe('not_applicable');
  });

  it('checkHardcodedDevelopmentUrls returns not_applicable when developmentUrls absent', () => {
    const result = checkHardcodedDevelopmentUrls(emptyConfig, findReq('dev-urls'));
    expect(result.status).toBe('not_applicable');
  });

  it('checkDirectMutationFlags returns not_applicable when mutations absent', () => {
    const result = checkDirectMutationFlags(emptyConfig, findReq('direct-mutations'));
    expect(result.status).toBe('not_applicable');
  });

  it('checkExternalDependencyInventory returns not_applicable when externalDependencies absent', () => {
    const result = checkExternalDependencyInventory(emptyConfig, findReq('external-deps'));
    expect(result.status).toBe('not_applicable');
  });
});

describe('Security: authorization / org isolation contract', () => {
  it('rejects a non-UUID organizationId/actorId (fail closed)', async () => {
    process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
    const result = await runShopifyAppReadinessScan(validInput, {
      organizationId: 'not-a-uuid',
      actorId: 'also-not-a-uuid',
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('UUID');
  });
});

describe('Security: audit-log completeness (buildAuditEvent)', () => {
  it('emits a redacted, hashed audit event via the writer', async () => {
    process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED = 'true';
    const captured: AuditEvent[] = [];
    const writer: AuditWriter = (event) => {
      captured.push(event);
      return Promise.resolve();
    };
    const result = await runShopifyAppReadinessScan(validInput, {
      ...validContext,
      auditWriter: writer,
    });
    expect(result.status).toBe('completed');
    expect(captured.length).toBe(1);
    const event = captured[0];
    expect(event).toBeDefined();
    if (!event) throw new Error('expected audit event');
    expect(event.action).toBe('analyze.appstore_readiness');
    expect(event.outcome).toBe('success');
    // inputHash is a SHA-256 hex digest; raw input is never persisted.
    expect(event.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toContain('read_products');
    expect(event.orgId).toBe(validContext.organizationId);
    expect(event.userId).toBe(validContext.actorId);
  });
});

describe('Security: report manipulation (integrity hash)', () => {
  it('computes a stable report hash and detects tampering', () => {
    const report = generateReadinessReport({
      appMetadata: baseAppMetadata,
      scanMetadata: baseScanMetadata,
      staticCheckResults: [],
      manualReviewResults: [],
    });
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeReportHash(report)).toBe(report.reportHash);

    const tampered: ReadinessReport = {
      ...report,
      summary: { ...report.summary, failed: 999 },
    };
    expect(computeReportHash(tampered)).not.toBe(report.reportHash);
  });
});

describe('Security: stale requirement handling', () => {
  it('downgrades overall status to needs_review when requirements are stale', () => {
    const report = generateReadinessReport({
      appMetadata: baseAppMetadata,
      scanMetadata: { ...baseScanMetadata, scanTimestamp: '2027-03-01T00:00:00Z' },
      staticCheckResults: [],
      manualReviewResults: [],
    });
    expect(report.staleWarnings.length).toBeGreaterThan(0);
    expect(report.summary.overallStatus).toBe('needs_review');
  });
});

describe('Security: incomplete review cannot report ready', () => {
  it('downgrades to needs_review when a manual_review check has no matching review', () => {
    const report = generateReadinessReport({
      appMetadata: baseAppMetadata,
      scanMetadata: baseScanMetadata,
      staticCheckResults: [{ requirementId: 'embedded-app', status: 'manual_review', message: 'manual' }],
      manualReviewResults: [],
    });
    expect(report.summary.overallStatus).toBe('needs_review');
  });
});

describe('Security: input bounds (denial-of-service)', () => {
  it('rejects an oversized scopes array', () => {
    const input = {
      ...validInput,
      appMetadata: {
        ...validInput.appMetadata,
        scopes: Array.from({ length: 501 }, () => 'read_products'),
      },
    };
    const result = ShopifyAppReadinessInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a non-hex commitSha', () => {
    const input = {
      ...validInput,
      scanConfig: { ...validInput.scanConfig, commitSha: 'z'.repeat(40) },
    };
    const result = ShopifyAppReadinessInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
