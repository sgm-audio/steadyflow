import { z } from 'zod';

/**
 * Printify API response schemas.
 * Docs: https://developers.printify.com/
 *
 * We only model what we need: shop ID + catalog variants with cost.
 */

export const VariantSchema = z.object({
  id: z.number(),
  sku: z.string(),
  cost: z.number(), // cents USD
  price: z.number().optional(),
  title: z.string().optional(),
});

export const PrintShopSchema = z.object({
  id: z.number(),
  title: z.string(),
});

export const PrintifyCatalogResponseSchema = z.object({
  id: z.number(),
  title: z.string(),
  variants: z.array(VariantSchema).optional().default([]),
});

export const ShopsListResponseSchema = z.array(PrintShopSchema);

export type PrintifyVariant = z.infer<typeof VariantSchema>;
export type PrintifyCatalogResponse = z.infer<typeof PrintifyCatalogResponseSchema>;
export type PrintifyShop = z.infer<typeof PrintShopSchema>;
