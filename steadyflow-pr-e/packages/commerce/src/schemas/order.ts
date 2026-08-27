import { z } from 'zod';
import { Money } from './money.js';
import { CommerceExternalId, FulfillmentProviderId, SellingPlatformId } from './roles.js';

export const CommerceAddress = z
  .object({
    name: z.string().max(200).optional(),
    line1: z.string().max(200),
    line2: z.string().max(200).optional(),
    city: z.string().max(100),
    region: z.string().max(100).optional(),
    postalCode: z.string().max(32),
    country: z.string().length(2),
    phone: z.string().max(40).optional(),
  })
  .strict();
export type CommerceAddress = z.infer<typeof CommerceAddress>;

export const CommerceOrderLine = z
  .object({
    externalId: CommerceExternalId,
    sku: z.string().max(255).optional(),
    title: z.string().min(1).max(500),
    quantity: z.number().int().positive(),
    unitPrice: Money.optional(),
  })
  .strict();
export type CommerceOrderLine = z.infer<typeof CommerceOrderLine>;

export const CommerceOrderStatus = z.enum([
  'pending',
  'paid',
  'fulfilling',
  'shipped',
  'cancelled',
  'refunded',
  'unknown',
]);
export type CommerceOrderStatus = z.infer<typeof CommerceOrderStatus>;

export const CommerceOrder = z
  .object({
    externalId: CommerceExternalId,
    platform: SellingPlatformId,
    status: CommerceOrderStatus,
    currency: z.string().length(3),
    total: Money.optional(),
    lines: z.array(CommerceOrderLine).min(1).max(500),
    shippingAddress: CommerceAddress.optional(),
    fulfillmentProvider: FulfillmentProviderId.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export type CommerceOrder = z.infer<typeof CommerceOrder>;
