import { z } from 'zod';
import { Money } from './money.js';
import { DistributorProviderId } from './roles.js';

/**
 * Distributor / supplier catalog row (Alibaba sourcing, Printify blank goods, etc.).
 */
export const DistributorOffer = z
  .object({
    provider: DistributorProviderId,
    externalId: z.string().min(1).max(255),
    title: z.string().min(1).max(500),
    sku: z.string().max(255).optional(),
    unitCost: Money.optional(),
    moq: z.number().int().positive().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();
export type DistributorOffer = z.infer<typeof DistributorOffer>;

export const DistributorOrderHandoff = z
  .object({
    provider: DistributorProviderId,
    offerExternalId: z.string().min(1).max(255),
    quantity: z.number().int().positive(),
    notes: z.string().max(2000).optional(),
    /** Idempotency key for the handoff request. */
    idempotencyKey: z.string().min(1).max(255),
  })
  .strict();
export type DistributorOrderHandoff = z.infer<typeof DistributorOrderHandoff>;

export const DistributorHandoffResult = z
  .object({
    accepted: z.boolean(),
    externalOrderId: z.string().max(255).optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();
export type DistributorHandoffResult = z.infer<typeof DistributorHandoffResult>;
