import { z } from 'zod';

/**
 * Zod schemas for Shopify Admin GraphQL responses.
 * These validate the SHAPE of the response — not the full GraphQL spec.
 * We only model the fields we actually consume.
 */

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

const PriceRangeSchema = z.object({
  minVariantPrice: MoneySchema,
  maxVariantPrice: MoneySchema,
});

const VariantNodeSchema = z.object({
  id: z.string(),
  sku: z.string().nullable().optional(),
  title: z.string(),
  price: z.string(),
  weight: z.number().nullable().optional(),
  weightUnit: z.string().nullable().optional(),
});

const VariantsConnectionSchema = z.object({
  edges: z.array(z.object({ node: VariantNodeSchema })),
});

const ImageNodeSchema = z.object({
  id: z.string(),
  altText: z.string().nullable().optional(),
  url: z.string(),
});

const ImagesConnectionSchema = z.object({
  edges: z.array(z.object({ node: ImageNodeSchema })),
});

const CollectionNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
});

const CollectionsConnectionSchema = z.object({
  edges: z.array(z.object({ node: CollectionNodeSchema })),
});

const ProductNodeSchema = z.object({
  id: z.string(),
  handle: z.string(),
  title: z.string(),
  status: z.string(),
  productType: z.string(),
  tags: z.array(z.string()),
  descriptionHtml: z.string(),
  priceRangeV2: PriceRangeSchema,
  variants: VariantsConnectionSchema,
  images: ImagesConnectionSchema,
  collections: CollectionsConnectionSchema,
});

const ProductsConnectionSchema = z.object({
  edges: z.array(z.object({ node: ProductNodeSchema })),
});

const AllCollectionsConnectionSchema = z.object({
  edges: z.array(
    z.object({
      node: CollectionNodeSchema.extend({
        productsCount: z.object({ count: z.number() }),
      }),
    }),
  ),
});

export const CatalogResponseSchema = z.object({
  shop: z.object({ currencyCode: z.string() }),
  products: ProductsConnectionSchema,
  collections: AllCollectionsConnectionSchema,
});

export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;
export type ShopifyProduct = z.infer<typeof ProductNodeSchema>;
export type ShopifyVariant = z.infer<typeof VariantNodeSchema>;
export type ShopifyImage = z.infer<typeof ImageNodeSchema>;
export type ShopifyCollection = z.infer<typeof CollectionNodeSchema>;
export type ShopifyAllCollection = z.infer<
  typeof AllCollectionsConnectionSchema
>['edges'][number]['node'];
