import { z } from 'zod';
import { CommerceExternalId, SellingPlatformId } from './roles.js';

export const CommerceInventoryLevel = z
  .object({
    platform: SellingPlatformId,
    sku: z.string().min(1).max(255),
    externalVariantId: CommerceExternalId.optional(),
    available: z.number().int(),
    locationId: z.string().max(255).optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CommerceInventoryLevel = z.infer<typeof CommerceInventoryLevel>;
