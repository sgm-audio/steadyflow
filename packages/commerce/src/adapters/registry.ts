import type { CommerceConfig } from '../schemas/config.js';
import type {
  DistributorProviderId,
  FulfillmentProviderId,
  SellingPlatformId,
} from '../schemas/roles.js';
import type { DistributorAdapter, FulfillmentAdapter, SellingPlatformAdapter } from './types.js';
import { createShopifySellingAdapter } from './shopify/selling.js';
import { createPrintifyFulfillmentAdapter } from './printify/fulfillment.js';

export interface CommerceCredentials {
  'shopify-admin'?: string | undefined;
  printify?: string | undefined;
  'amazon-sp-api'?: string | undefined;
  alibaba?: string | undefined;
}

export interface CommerceRegistry {
  config: CommerceConfig;
  selling: Map<SellingPlatformId, SellingPlatformAdapter>;
  fulfillment: Map<FulfillmentProviderId, FulfillmentAdapter>;
  distributors: Map<DistributorProviderId, DistributorAdapter>;
  /** Platforms that are live (not stubs) and successfully constructed. */
  readySelling: SellingPlatformId[];
  /** Stub adapters registered for expansion readiness. */
  stubAdapters: string[];
}

export interface CreateCommerceRegistryOptions {
  config: CommerceConfig;
  credentials?: CommerceCredentials | undefined;
}

/**
 * Build a registry of platform adapters from validated commerce config + BYOK credentials.
 * Missing credentials skip live adapters; stubs are always available for planning.
 */
export function createCommerceRegistry(opts: CreateCommerceRegistryOptions): CommerceRegistry {
  const { config, credentials = {} } = opts;
  const selling = new Map<SellingPlatformId, SellingPlatformAdapter>();
  const fulfillment = new Map<FulfillmentProviderId, FulfillmentAdapter>();
  const distributors = new Map<DistributorProviderId, DistributorAdapter>();
  const readySelling: SellingPlatformId[] = [];
  const stubAdapters: string[] = [];

  for (const channel of config.selling) {
    if (!channel.enabled) continue;

    switch (channel.platform) {
      case 'shopify': {
        const token = credentials['shopify-admin'];
        const storeUrl = channel.storeUrl;
        if (token && storeUrl) {
          const adapter = createShopifySellingAdapter({
            storeUrl,
            adminToken: token,
            ...(credentials.printify ? { printifyToken: credentials.printify } : {}),
          });
          selling.set('shopify', adapter);
          readySelling.push('shopify');
        }
        break;
      }
      case 'amazon':
      case 'woocommerce':
      case 'etsy': {
        // v0.x trim: experimental selling platforms not instantiated.
        // Keep config validation but do not construct stub adapters.
        stubAdapters.push(channel.platform);
        break;
      }
      default: {
        const _exhaustive: never = channel.platform;
        void _exhaustive;
      }
    }
  }

  for (const channel of config.fulfillment) {
    if (!channel.enabled) continue;

    switch (channel.provider) {
      case 'printify': {
        const token = credentials.printify;
        if (token) {
          const parsedShopId =
            channel.externalShopId !== undefined && channel.externalShopId !== ''
              ? Number.parseInt(channel.externalShopId, 10)
              : Number.NaN;
          fulfillment.set(
            'printify',
            createPrintifyFulfillmentAdapter({
              token,
              ...(Number.isFinite(parsedShopId) ? { shopId: parsedShopId } : {}),
            }),
          );
        }
        break;
      }
      case 'amazon-fba':
      case 'amazon-fbm':
      case 'manual': {
        // v0.x trim: experimental fulfillment not instantiated.
        stubAdapters.push(channel.provider);
        break;
      }
      default: {
        const _exhaustive: never = channel.provider;
        void _exhaustive;
      }
    }
  }

  for (const channel of config.distributors) {
    if (!channel.enabled) continue;

    switch (channel.provider) {
      case 'alibaba':
      case 'printify': {
        // v0.x trim: distributors not instantiated (Printify cost lives in shopify-admin).
        stubAdapters.push(channel.provider === 'printify' ? 'printify-distributor' : channel.provider);
        break;
      }
      default: {
        const _exhaustive: never = channel.provider;
        void _exhaustive;
      }
    }
  }

  return { config, selling, fulfillment, distributors, readySelling, stubAdapters };
}
