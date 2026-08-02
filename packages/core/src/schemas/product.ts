import { z } from 'zod';

export const ProductId = z.string().uuid().brand<'ProductId'>();
export type ProductId = z.infer<typeof ProductId>;

const Money = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
});

export const Product = z
  .object({
    id: ProductId,
    platform: z.enum(['shopify', 'etsy', 'amazon', 'woocommerce']),
    externalId: z.string().min(1).max(255),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    url: z.string().url().max(2048),
    price: Money.optional(),
    images: z.array(z.string().url()).max(50).default([]),
    tags: z.array(z.string().max(100)).max(100).default([]),
    inStock: z.boolean().optional(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Product = z.infer<typeof Product>;
