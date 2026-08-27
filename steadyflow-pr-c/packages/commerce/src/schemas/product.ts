import { z } from 'zod';
import { Money } from './money.js';
import { CommerceExternalId, SellingPlatformId } from './roles.js';

export const CommerceVariant = z
  .object({
    externalId: CommerceExternalId,
    sku: z.string().max(255).optional(),
    title: z.string().min(1).max(500),
    price: Money.optional(),
    cost: Money.optional(),
    weightGrams: z.number().nonnegative().optional(),
    inventoryQuantity: z.number().int().optional(),
    barcode: z.string().max(64).optional(),
  })
  .strict();
export type CommerceVariant = z.infer<typeof CommerceVariant>;

export const CommerceProduct = z
  .object({
    externalId: CommerceExternalId,
    platform: SellingPlatformId,
    handle: z.string().max(255).optional(),
    title: z.string().min(1).max(500),
    descriptionHtml: z.string().max(100_000).optional(),
    status: z.enum(['active', 'draft', 'archived', 'unknown']).default('unknown'),
    productType: z.string().max(255).optional(),
    tags: z.array(z.string().max(100)).max(200).default([]),
    url: z.string().url().max(2048).optional(),
    images: z
      .array(
        z
          .object({
            url: z.string().url().max(2048),
            altText: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    variants: z.array(CommerceVariant).max(500).default([]),
    collections: z.array(z.string().max(255)).max(100).default([]),
    syncedAt: z.string().datetime(),
  })
  .strict();
export type CommerceProduct = z.infer<typeof CommerceProduct>;

export const CommerceCatalog = z
  .object({
    platform: SellingPlatformId,
    currency: z.string().length(3),
    products: z.array(CommerceProduct),
    totalProducts: z.number().int().nonnegative(),
    fetchedAt: z.string().datetime(),
  })
  .strict();
export type CommerceCatalog = z.infer<typeof CommerceCatalog>;
