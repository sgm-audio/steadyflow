import { z } from 'zod';
import { buildAuditEvent } from '../../audit/event.js';
import type { AppConfiguration } from './checks';
import { runStaticChecks } from './checks';
import type { ManualReviewItem } from './manual-review';
import { getShopifyAppRequirements } from './registry';
import {
  generateReadinessReport,
  reportToHtml,
  reportToJson,
  reportToMarkdown,
} from './report-generator';

const MAX_LIST_ITEMS = 500;
const MAX_STRING_LENGTH = 2000;

export const ShopifyAppReadinessInputSchema = z.object({
  appId: z.string().uuid(),
  appMetadata: z.object({
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    version: z.string().min(1).max(100),
    apiVersion: z.string().min(1).max(100),
    embedded: z.boolean(),
    scopes: z.array(z.string().min(1).max(MAX_STRING_LENGTH)).max(MAX_LIST_ITEMS),
    privacyPolicyUrl: z.string().url().max(MAX_STRING_LENGTH).optional(),
    supportUrl: z.string().url().max(MAX_STRING_LENGTH).optional(),
    webhooks: z
      .array(
        z.object({
          topic: z.string().min(1).max(MAX_STRING_LENGTH),
          address: z.string().url().max(MAX_STRING_LENGTH),
        }),
      )
      .max(MAX_LIST_ITEMS)
      .optional(),
    extensions: z
      .array(
        z.object({
          type: z.string().min(1).max(MAX_STRING_LENGTH),
          handle: z.string().min(1).max(MAX_STRING_LENGTH),
        }),
      )
      .max(MAX_LIST_ITEMS)
      .optional(),
    // Never accept clientSecret/clientId — secrets must not be submitted as scan input.
    oauth: z
      .object({
        redirectUris: z.array(z.string().url().max(MAX_STRING_LENGTH)).max(MAX_LIST_ITEMS),
      })
      .optional(),
    developmentUrls: z
      .array(z.string().min(1).max(MAX_STRING_LENGTH))
      .max(MAX_LIST_ITEMS)
      .optional(),
    mutations: z.array(z.string().min(1).max(MAX_STRING_LENGTH)).max(MAX_LIST_ITEMS).optional(),
    externalDependencies: z
      .array(z.string().min(1).max(MAX_STRING_LENGTH))
      .max(MAX_LIST_ITEMS)
      .optional(),
  }),
  scanConfig: z.object({
    commitSha: z.string().regex(/^[0-9a-fA-F]{40}$/),
    scannedBy: z.string().email().max(320),
    includeHtml: z.boolean().default(false),
  }),
  manualReviews: z
    .array(
      z.object({
        requirementId: z.string().min(1).max(200),
        requirementVersion: z.string().min(1).max(100),
        reviewerId: z.string().email().max(320),
        reviewerName: z.string().min(1).max(200),
        decision: z.enum(['approved', 'rejected', 'conditional', 'deferred']),
        evidence: z
          .array(
            z.object({
              type: z.enum([
                'screenshot',
                'document',
                'code_reference',
                'test_result',
                'external_link',
                'other',
              ]),
              url: z.string().url().max(MAX_STRING_LENGTH).optional(),
              content: z.string().max(MAX_STRING_LENGTH).optional(),
              description: z.string().min(1).max(MAX_STRING_LENGTH),
              capturedAt: z.string().datetime(),
              capturedBy: z.string().email().max(320),
            }),
          )
          .max(MAX_LIST_ITEMS)
          .optional(),
        applicabilityDecision: z.enum(['applicable', 'not_applicable', 'unknown']),
        applicabilityReason: z.string().max(MAX_STRING_LENGTH).optional(),
        waiver: z
          .object({
            id: z.string().min(1).max(200),
            reason: z.string().min(1).max(MAX_STRING_LENGTH),
            grantedBy: z.string().email().max(320),
            grantedAt: z.string().datetime(),
            expiresAt: z.string().datetime().optional(),
            conditions: z.array(z.string().max(MAX_STRING_LENGTH)).max(MAX_LIST_ITEMS).optional(),
          })
          .optional(),
        reviewedAt: z.string().datetime(),
        notes: z.string().max(MAX_STRING_LENGTH).optional(),
      }),
    )
    .max(MAX_LIST_ITEMS)
    .optional(),
});

export type ShopifyAppReadinessInput = z.infer<typeof ShopifyAppReadinessInputSchema>;

export interface ShopifyAppReadinessOutput {
  reportId: string;
  status: 'completed' | 'failed';
  reportJson?: string | undefined;
  reportMarkdown?: string | undefined;
  reportHtml?: string | undefined;
  error?: string | undefined;
}

export type AuditEvent = ReturnType<typeof buildAuditEvent>;
export type AuditWriter = (event: AuditEvent) => Promise<void>;

export interface ReadinessScanContext {
  /** UUID of the organization the scan is scoped to. */
  organizationId: string;
  /** UUID of the authenticated actor (user) performing the scan. */
  actorId: string;
  /** Optional persistence hook. Defaults to a console logger in non-production. */
  auditWriter?: AuditWriter | undefined;
}

const ScanContextSchema = z.object({
  organizationId: z.string().uuid(),
  actorId: z.string().uuid(),
});

function isFeatureEnabled(): boolean {
  return process.env.STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED === 'true';
}

const defaultAuditWriter: AuditWriter = (event) => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[AUDIT]', JSON.stringify(event));
  }
  return Promise.resolve();
};

/**
 * Experimental Shopify App Store readiness scan.
 *
 * Authorization contract: this module has no database access and cannot verify
 * membership, so it trusts `context.organizationId`/`context.actorId` and
 * attributes audit events to them. The integration layer (BFF / procedure
 * router) MUST verify that `actorId` is an authenticated member of
 * `organizationId` before calling this function. Only a UUID is enforced here
 * (fail closed on malformed identity).
 */
export async function runShopifyAppReadinessScan(
  input: ShopifyAppReadinessInput,
  context: ReadinessScanContext,
): Promise<ShopifyAppReadinessOutput> {
  if (!isFeatureEnabled()) {
    return {
      reportId: '',
      status: 'failed',
      error:
        'Shopify App Readiness feature is disabled. Set STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED=true to enable.',
    };
  }

  const contextValidation = ScanContextSchema.safeParse({
    organizationId: context.organizationId,
    actorId: context.actorId,
  });
  if (!contextValidation.success) {
    return {
      reportId: '',
      status: 'failed',
      error: 'Invalid scan context: organizationId and actorId must be valid UUIDs.',
    };
  }

  const writer = context.auditWriter ?? defaultAuditWriter;

  // Input validation
  const validation = ShopifyAppReadinessInputSchema.safeParse(input);
  if (!validation.success) {
    return {
      reportId: '',
      status: 'failed',
      error: `Invalid input: ${validation.error.errors.map((e) => e.message).join(', ')}`,
    };
  }

  const validatedInput = validation.data;
  const reportId = `readiness-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startedAt = Date.now();

  try {
    // Convert app metadata to AppConfiguration for static checks. Fields that
    // are absent stay undefined so the checks report `not_applicable` (honest)
    // instead of a false `pass`/`fail`.
    const appConfig: AppConfiguration = {
      name: validatedInput.appMetadata.name,
      description: validatedInput.appMetadata.description,
      privacyPolicyUrl: validatedInput.appMetadata.privacyPolicyUrl,
      supportUrl: validatedInput.appMetadata.supportUrl,
      scopes: validatedInput.appMetadata.scopes,
      webhooks: validatedInput.appMetadata.webhooks,
      extensions: validatedInput.appMetadata.extensions,
      embeddedApp: validatedInput.appMetadata.embedded,
      oauth: validatedInput.appMetadata.oauth
        ? { redirectUris: validatedInput.appMetadata.oauth.redirectUris }
        : undefined,
      developmentUrls: validatedInput.appMetadata.developmentUrls,
      mutations: validatedInput.appMetadata.mutations,
      externalDependencies: validatedInput.appMetadata.externalDependencies,
      themeExtensions:
        validatedInput.appMetadata.extensions
          ?.filter((e) => e.type === 'theme_app_extension')
          .map((e) => ({ name: e.handle, handle: e.handle })) ?? [],
    };

    // Run static checks
    const requirements = getShopifyAppRequirements();
    const staticCheckResults = runStaticChecks(appConfig, requirements);

    // Prepare manual reviews
    const manualReviews: ManualReviewItem[] = (validatedInput.manualReviews ?? []).map((r) => ({
      ...r,
      evidence: r.evidence ?? [],
    }));

    // Generate report
    const report = generateReadinessReport({
      appMetadata: validatedInput.appMetadata,
      scanMetadata: {
        scanTimestamp: new Date().toISOString(),
        commitSha: validatedInput.scanConfig.commitSha,
        scannerVersion: '0.1.0',
        scannedBy: validatedInput.scanConfig.scannedBy,
      },
      staticCheckResults,
      manualReviewResults: manualReviews,
    });

    // Audit: redacted + hashed via buildAuditEvent (no plaintext input).
    await writer(
      buildAuditEvent({
        orgId: context.organizationId,
        userId: context.actorId,
        action: 'analyze.appstore_readiness',
        outcome: 'success',
        input: validatedInput,
        durationMs: Date.now() - startedAt,
        metadata: { reportId, overallStatus: report.summary.overallStatus, experimental: true },
      }),
    );

    // Generate output formats
    const reportJson = reportToJson(report);
    const reportMarkdown = reportToMarkdown(report);
    const reportHtml = validatedInput.scanConfig.includeHtml ? reportToHtml(report) : undefined;

    return {
      reportId,
      status: 'completed',
      reportJson,
      reportMarkdown,
      reportHtml,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await writer(
      buildAuditEvent({
        orgId: context.organizationId,
        userId: context.actorId,
        action: 'analyze.appstore_readiness',
        outcome: 'error',
        input: input,
        durationMs: Date.now() - startedAt,
        errorCode: 'READINESS_SCAN_FAILED',
        metadata: { reportId, experimental: true },
      }),
    );

    return {
      reportId,
      status: 'failed',
      error: errorMessage,
    };
  }
}

export function getFeatureFlagStatus(): { enabled: boolean; envVar: string } {
  return {
    enabled: isFeatureEnabled(),
    envVar: 'STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED',
  };
}
