import { z } from 'zod';

export const ValidationModeSchema = z.enum(['automatic', 'manual', 'hybrid']);
export const SeveritySchema = z.enum(['blocker', 'warning']);
export const CategorySchema = z.enum([
  'authentication',
  'authorization',
  'api',
  'billing',
  'functionality',
  'performance',
  'security',
  'privacy',
  'installation',
  'theme',
  'listing',
  'submission',
  'other'
]);

export const ShopifyAppRequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  validationMode: ValidationModeSchema,
  applicability: z.array(z.string()),
  officialSourceUrl: z.string().url(),
  officialSourceTitle: z.string(),
  verifiedAt: z.string().datetime(),
  sourceVersion: z.string().optional(),
  thirdPartyReference: z.string().optional(),
  notes: z.string().optional(),
  evidenceExpectations: z.array(z.string()).optional()
});

export const ShopifyAppRequirementRegistrySchema = z.object({
  version: z.string(),
  schemaVersion: z.string(),
  requirements: z.array(ShopifyAppRequirementSchema)
});

export type ShopifyAppRequirement = z.infer<typeof ShopifyAppRequirementSchema>;
export type ShopifyAppRequirementRegistry = z.infer<typeof ShopifyAppRequirementRegistrySchema>;

export const ShopifyAppCategorySchema = z.object({
  category: CategorySchema,
  description: z.string()
});

export const ShopifyAppValidationModeSchema = z.object({
  validationMode: ValidationModeSchema,
  description: z.string()
});

export const ShopifyAppSeveritySchema = z.object({
  severity: SeveritySchema,
  description: z.string()
});

export default {
  ShopifyAppRequirementSchema,
  ShopifyAppRequirementRegistrySchema,
  ShopifyAppCategorySchema,
  ShopifyAppValidationModeSchema,
  ShopifyAppSeveritySchema
};