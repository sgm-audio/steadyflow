/**
 * Shopify Admin GraphQL queries for the v2 catalog audit.
 * Paginated — fetches up to 250 products across all pages.
 */

export const CATALOG_PAGE_QUERY = /* GraphQL */ `
  query CatalogAudit($cursor: String) {
    shop {
      name
      email
      currencyCode
      plan {
        displayName
        partnerDevelopment
        shopifyPlus
      }
      primaryDomain { url host }
      timezoneAbbreviation
      billingAddress { country city province }
    }
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          handle
          title
          status
          productType
          vendor
          tags
          descriptionHtml
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          compareAtPriceRange {
            minVariantCompareAtPrice { amount currencyCode }
            maxVariantCompareAtPrice { amount currencyCode }
          }
          featuredImage { url altText width height }
          options { id name values }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
                weight
                weightUnit
                availableForSale
              }
            }
          }
          images(first: 50) {
            edges {
              node { id altText url }
            }
          }
          collections(first: 100) {
            edges {
              node { id title handle }
            }
          }
          hasOnlyDefaultVariant
          mediaCount { count }
          createdAt
          publishedAt
          onlineStorePreviewUrl
        }
      }
    }
    collections(first: 250) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          image { url altText width height }
          productsCount { count }
        }
      }
    }
  }
`;

/** Legacy single-page query — kept for backward compatibility but NOT used in v2 audit. */
export const CATALOG_QUERY = CATALOG_PAGE_QUERY;

/**
 * Recent-orders query backing real (not assumed) revenue-impact estimates.
 * Requires `read_orders`. Fetches the most recent 250 orders and derives AOV +
 * order velocity from their `createdAt` spread.
 */
export const SALES_SUMMARY_QUERY = /* GraphQL */ `
  query SalesSummary {
    orders(first: 250, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage }
      edges {
        node {
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
    }
  }
`;
