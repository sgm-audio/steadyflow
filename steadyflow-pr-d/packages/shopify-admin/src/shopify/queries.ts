/**
 * Single GraphQL query for the entire catalog audit.
 * Batched to minimize cost units (~330 for 25 products).
 */
export const CATALOG_QUERY = /* GraphQL */ `
  query CatalogAudit {
    shop {
      currencyCode
    }
    products(first: 25) {
      edges {
        node {
          id
          handle
          title
          status
          productType
          tags
          descriptionHtml
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
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                weight
                weightUnit
              }
            }
          }
          images(first: 50) {
            edges {
              node {
                id
                altText
                url
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
        }
      }
    }
    collections(first: 250) {
      edges {
        node {
          id
          title
          handle
          productsCount {
            count
          }
        }
      }
    }
  }
`;
