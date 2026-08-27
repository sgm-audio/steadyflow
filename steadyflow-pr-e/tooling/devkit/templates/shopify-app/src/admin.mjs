/**
 * Minimal Admin GraphQL helper — swap for @steadyflow/shopify-admin in monorepo apps.
 */
export async function adminGraphql(shop, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify Admin HTTP ${res.status}`);
  }
  return res.json();
}

export const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          status
        }
      }
    }
  }
`;
