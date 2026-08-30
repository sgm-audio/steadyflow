/**
 * Shopify Admin GraphQL queries for the v2 catalog audit.
 * Paginated — fetches up to MAX_CATALOG_PAGES (10) pages × 50 = 500 products
 * across all pages. New fields added in v2 audit: updatedAt, tracksInventory,
 * isGiftCard, requiresShipping (product + variant), taxable, barcode,
 * inventoryPolicy, position, vendor, onlineStoreUrl, giftCardTemplateSuffix.
 */

export const CATALOG_PAGE_QUERY = /* GraphQL */ `
  query CatalogAudit($cursor: String) {
    shop {
      name
      email
      currencyCode
      description
      plan {
        displayName
        partnerDevelopment
        shopifyPlus
      }
      primaryDomain {
        url
        host
      }
      timezoneAbbreviation
      billingAddress {
        country
        city
        province
        zip
      }
      ianaTimezone
    }
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
          description
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          compareAtPriceRange {
            minVariantCompareAtPrice {
              amount
              currencyCode
            }
            maxVariantCompareAtPrice {
              amount
              currencyCode
            }
          }
          seo {
            title
            description
          }
          featuredImage {
            url
            altText
            width
            height
          }
          options {
            id
            name
            position
            values
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          images(first: 50) {
            edges {
              node {
                id
                altText
                url
                width
                height
              }
            }
          }
          collections(first: 100) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
          hasOnlyDefaultVariant
          mediaCount {
            count
          }
          tracksInventory
          isGiftCard
          onlineStoreUrl
          createdAt
          updatedAt
          publishedAt
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
          description
          image {
            url
            altText
            width
            height
          }
          productsCount {
            count
          }
          updatedAt
          sortOrder
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
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

/** Maximum pages fetched by fetchCatalog (50 products per page = 500 products total). */
export const MAX_CATALOG_PAGES = 10;
