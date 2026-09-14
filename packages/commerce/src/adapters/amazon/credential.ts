import { z } from 'zod';

/**
 * Amazon SP-API credential envelope (BYOK — stored encrypted, passed here as
 * a JSON string from the commerce registry).
 */
export const AmazonSpApiCredentialsSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    refreshToken: z.string().min(1),
    awsAccessKeyId: z.string().min(1),
    awsSecretAccessKey: z.string().min(1),
    sellerId: z.string().min(1),
    marketplaceIds: z.array(z.string().min(1)).min(1),
    region: z.enum(['na', 'eu', 'fe']).default('na'),
  })
  .strict();
export type SpApiCredentials = z.infer<typeof AmazonSpApiCredentialsSchema>;

function parseJsonEnvelope(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('[commerce/amazon] SP-API credential envelope is not valid JSON');
  }
}

/** Validates the envelope at the trust boundary — throws loudly, never silently skips. */
export function parseAmazonSpApiCredentials(
  raw: string | Record<string, unknown>,
): SpApiCredentials {
  const parsed = AmazonSpApiCredentialsSchema.safeParse(
    typeof raw === 'string' ? parseJsonEnvelope(raw) : raw,
  );
  if (!parsed.success) {
    throw new Error(
      `[commerce/amazon] Invalid SP-API credential envelope:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
