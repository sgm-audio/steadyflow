import type { CatalogAuditResult, ShopifyProduct } from '@steadyflow/shopify-admin';
import type { Money } from '../schemas/money.js';
import type { CommerceCatalog, CommerceProduct, CommerceVariant } from '../schemas/product.js';

function money(amount: number, currency: string): Money {
  return { amount, currency };
}

function mapVariant(
  node: ShopifyProduct['variants']['edges'][number]['node'],
  currency: string,
): CommerceVariant {
  const priceNum = Number.parseFloat(node.price);
  const variant: CommerceVariant = {
    externalId: node.id,
    title: node.title,
  };
  if (node.sku?.trim()) {
    variant.sku = node.sku.trim();
  }
  if (Number.isFinite(priceNum)) {
    variant.price = money(priceNum, currency);
  }
  const weight = node.weight?.value;
  const weightUnit = node.weight?.unit;
  if (typeof weight === 'number' && weight > 0) {
    // Shopify weight units vary; normalize only when unit is grams / kg.
    if (weightUnit === 'GRAMS' || weightUnit === 'g') {
      variant.weightGrams = weight;
    } else if (weightUnit === 'KILOGRAMS' || weightUnit === 'kg') {
      variant.weightGrams = weight * 1000;
    }
  }
  return variant;
}

function mapStatus(status: string): CommerceProduct['status'] {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'DRAFT') return 'draft';
  if (s === 'ARCHIVED') return 'archived';
  return 'unknown';
}

/**
 * Map a Shopify Admin product node into the unified CommerceProduct shape.
 */
export function mapShopifyProduct(
  product: ShopifyProduct,
  currency: string,
  syncedAt: string,
): CommerceProduct {
  const variants = product.variants.edges.map((e) => mapVariant(e.node, currency));
  const images = product.images.edges.map((e) => {
    const img: { url: string; altText?: string } = { url: e.node.url };
    if (e.node.altText) img.altText = e.node.altText;
    return img;
  });

  const mapped: CommerceProduct = {
    externalId: product.id,
    platform: 'shopify',
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    status: mapStatus(product.status),
    productType: product.productType,
    tags: [...product.tags],
    images,
    variants,
    collections: product.collections.edges.map((e) => e.node.title),
    syncedAt,
  };
  return mapped;
}

/**
 * Convert a full `@steadyflow/shopify-admin` catalog audit into CommerceCatalog.
 */
export function mapShopifyAuditToCatalog(
  audit: CatalogAuditResult,
  fetchedAt = new Date().toISOString(),
): CommerceCatalog {
  const products = audit.rows.map((row) =>
    mapShopifyProduct(row.product, audit.shopCurrency, fetchedAt),
  );
  return {
    platform: 'shopify',
    currency: audit.shopCurrency,
    products,
    totalProducts: audit.totalProducts,
    fetchedAt,
  };
}
