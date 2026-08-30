import { z } from 'zod';

/**
 * Zod schemas for Shopify Admin GraphQL responses.
 * Expanded for v2 audit — per-product SEO, inventory, pricing detail,
 * shop identity, collection SEO.
 */

const MoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

const PriceRangeSchema = z.object({
  minVariantPrice: MoneySchema,
  maxVariantPrice: MoneySchema,
});

const CompareAtPriceRangeSchema = z
  .object({
    minVariantCompareAtPrice: MoneySchema.nullable().optional(),
    maxVariantCompareAtPrice: MoneySchema.nullable().optional(),
  })
  .optional();

const SeoSchema = z
  .object({
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .optional();

const FeaturedImageSchema = z
  .object({
    url: z.string(),
    altText: z.string().nullable().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .nullish();

const OptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.array(z.string()),
});

const VariantNodeSchema = z.object({
  id: z.string(),
  sku: z.string().nullable().optional(),
  title: z.string(),
  price: z.string(),
  compareAtPrice: z.string().nullable().optional(),
  weight: z
    .object({
      value: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
    })
    .nullish(),
  inventoryQuantity: z.number().optional(),
  availableForSale: z.boolean().optional(),
  inventoryPolicy: z.enum(['DENY', 'CONTINUE']).optional(),
  barcode: z.string().nullable().optional(),
  taxable: z.boolean().optional(),
  requiresShipping: z.boolean().optional(),
  position: z.number().optional(),
  selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
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

const CollectionDetailSchema = CollectionNodeSchema.extend({
  descriptionHtml: z.string().optional(),
  description: z.string().optional(),
  seo: SeoSchema,
  image: FeaturedImageSchema,
  productsCount: z.object({ count: z.number() }).optional(),
  updatedAt: z.string().optional(),
  sortOrder: z.string().optional(),
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
  vendor: z.string().default(''),
  tags: z.array(z.string()),
  descriptionHtml: z.string(),
  description: z.string().optional(),
  priceRangeV2: PriceRangeSchema,
  compareAtPriceRange: CompareAtPriceRangeSchema.nullable().optional(),
  seo: SeoSchema,
  featuredImage: FeaturedImageSchema,
  options: z.array(OptionSchema).default([]),
  variants: VariantsConnectionSchema,
  images: ImagesConnectionSchema,
  collections: CollectionsConnectionSchema,
  totalInventory: z.number().optional(),
  availableForSale: z.boolean().optional(),
  hasOnlyDefaultVariant: z.boolean().optional(),
  mediaCount: z.object({ count: z.number() }).optional(),
  tracksInventory: z.boolean().optional(),
  isGiftCard: z.boolean().optional(),
  requiresShipping: z.boolean().optional(),
  onlineStoreUrl: z.string().nullable().optional(),
  onlineStorePreviewUrl: z.string().nullable().optional(),
  giftCardTemplateSuffix: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
});

const ProductsConnectionSchema = z.object({
  edges: z.array(z.object({ node: ProductNodeSchema })),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable().optional(),
  }),
});

const ShopSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  currencyCode: z.string(),
  description: z.string().optional(),
  plan: z
    .object({
      displayName: z.string(),
      partnerDevelopment: z.boolean().optional(),
      shopifyPlus: z.boolean().optional(),
    })
    .optional(),
  primaryDomain: z
    .object({
      url: z.string(),
      host: z.string(),
    })
    .optional(),
  timezoneAbbreviation: z.string().nullable().optional(),
  timezoneOffsetMinutes: z.number().optional(),
  ianaTimezone: z.string().optional(),
  billingAddress: z
    .object({
      country: z.string().optional(),
      city: z.string().nullable().optional(),
      province: z.string().nullable().optional(),
      zip: z.string().nullable().optional(),
    })
    .nullish(),
});

const AllCollectionsDetailSchema = z.object({
  edges: z.array(z.object({ node: CollectionDetailSchema })),
});

export const CatalogResponseSchema = z.object({
  shop: ShopSchema,
  products: ProductsConnectionSchema,
  collections: AllCollectionsDetailSchema,
});

/** A single page of the paginated catalog query. */
export const CatalogPageSchema = CatalogResponseSchema;

export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;
export type ShopifyProduct = z.infer<typeof ProductNodeSchema>;
export type ShopifyVariant = z.infer<typeof VariantNodeSchema>;
export type ShopifyImage = z.infer<typeof ImageNodeSchema>;
export type ShopifyCollection = z.infer<typeof CollectionNodeSchema>;
export type ShopifyAllCollection = z.infer<typeof CollectionDetailSchema>;
export type ShopifyShop = z.infer<typeof ShopSchema>;
export type ShopSeo = z.infer<typeof SeoSchema>;
