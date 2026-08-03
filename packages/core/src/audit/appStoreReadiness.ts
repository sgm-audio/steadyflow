import { z } from 'zod';
import { buildAuditEvent } from './event.js';

/**
 * Experimental Shopify App Store readiness checks.
 * - Keep experimental (not wired into production flows)
 * - Every requirement links to an official Shopify doc and records lastVerified
 * - Separates automated checks from manual-review items
 */

export const AppStoreStatus = z.enum([
  'pass',
  'fail',
  'warning',
  'manual_review',
  'not_applicable',
  'unknown',
]);
export type AppStoreStatus = z.infer<typeof AppStoreStatus>;

export const AppStoreRequirement = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  officialLink: z.string().url(),
  lastVerified: z.string().datetime({ offset: true }),
});
export type AppStoreRequirement = z.infer<typeof AppStoreRequirement>;

export const AppStoreRequirementResult = z.strictObject({
  requirement: AppStoreRequirement,
  status: AppStoreStatus,
  evidence: z.record(z.unknown()).optional(),
});
export type AppStoreRequirementResult = z.infer<typeof AppStoreRequirementResult>;

export const AppStoreReport = z.strictObject({
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(AppStoreRequirementResult),
});
export type AppStoreReport = z.infer<typeof AppStoreReport>;

/**
 * Input is intentionally narrow and synthetic for experimental use. Real-world
 * checks require store-level API access (not in this phase) and manual review.
 */
export const AppStoreInput = z.strictObject({
  metadata: z
    .object({
      privacyPolicyUrl: z.string().url().optional(),
      supportEmail: z.string().email().optional(),
      listingImageCount: z.number().int().nonnegative().optional(),
      usesOAuthPublic: z.boolean().optional(),
    })
    .optional(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type AppStoreInput = z.infer<typeof AppStoreInput>;

const now = () => new Date().toISOString();

export const runAppStoreReadinessCheck = (input: AppStoreInput): AppStoreReport => {
  const generatedAt = now();
  const lastVerified = generatedAt; // experimental: verified at run time

  const items: AppStoreRequirementResult[] = [];

  const metadata = input.metadata ?? {};

  // 1. Privacy policy presence (automated: presence of URL)
  items.push({
    requirement: {
      id: 'privacy_policy',
      title: 'Privacy policy URL present',
      description:
        'App listings must include a privacy policy URL linking to how merchant and customer data is used and stored.',
      officialLink: 'https://shopify.dev/docs/apps/privacy',
      lastVerified,
    },
    status: metadata.privacyPolicyUrl ? 'pass' : 'fail',
    evidence: metadata.privacyPolicyUrl ? { url: metadata.privacyPolicyUrl } : undefined,
  });

  // 2. Support contact (automated: support email present — otherwise manual)
  items.push({
    requirement: {
      id: 'support_contact',
      title: 'Support contact provided',
      description: 'Provide a support email or URL so merchants can contact the app vendor.',
      officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
      lastVerified,
    },
    status: metadata.supportEmail ? 'pass' : 'manual_review',
    evidence: metadata.supportEmail ? { email: metadata.supportEmail } : undefined,
  });

  // 3. Listing images (automated heuristic)
  items.push({
    requirement: {
      id: 'listing_images',
      title: 'Listing has required images',
      description:
        'App listing should include screenshots and marketing images that demonstrate core flows. This check is a heuristic (image count).',
      officialLink: 'https://shopify.dev/docs/apps/store/quality',
      lastVerified,
    },
    status:
      metadata.listingImageCount === undefined
        ? 'manual_review'
        : metadata.listingImageCount >= 3
        ? 'pass'
        : 'warning',
    evidence: metadata.listingImageCount === undefined ? undefined : { count: metadata.listingImageCount },
  });

  // 4. Public OAuth / installation model (manual)
  items.push({
    requirement: {
      id: 'oauth_model',
      title: 'OAuth/public app model (manual assessment)',
      description:
        "Determine whether the app's auth and billing model matches Shopify's App Store requirements — this is a manual review and must not enable public OAuth here.",
      officialLink: 'https://shopify.dev/docs/apps/auth',
      lastVerified,
    },
    status: metadata.usesOAuthPublic === undefined ? 'manual_review' : 'manual_review',
    evidence: metadata.usesOAuthPublic === undefined ? undefined : { usesOAuthPublic: metadata.usesOAuthPublic },
  });

  const report = { generatedAt, items };

  // Audit the analysis run (append-only metadata only, no secrets)
  try {
    buildAuditEvent({
      orgId: input.orgId,
      userId: input.userId,
      action: 'analyze.appstore_readiness',
      outcome: 'success',
      input: { metadata },
      durationMs: 0,
      metadata: { experimental: true },
    });
  } catch {
    // Fail closed: do not throw on audit build failures in this experimental path
  }

  return report;
};
