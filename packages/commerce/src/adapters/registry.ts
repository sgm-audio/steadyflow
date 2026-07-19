import type { CommerceConfig } from '../schemas/config.js';
import type {
  DistributorProviderId,
  FulfillmentProviderId,
  SellingPlatformId,
} from '../schemas/roles.js';
import type { DistributorAdapter, FulfillmentAdapter, SellingPlatformAdapter } from './types.js';
import { createShopifySellingAdapter } from './shopify/selling.js';
import { createPrintifyFulfillmentAdapter } from './printify/fulfillment.js';
import { createAmazonSellingAdapter } from './amazon/selling.js';
import {
  AmazonFbaFulfillmentAdapter,
  AmazonFbmFulfillmentAdapter,
} from './amazon/fulfillment.js';
import { createAlibabaDistributorAdapter } from './alibaba/distributor.js';
import { createWooCommerceSellingAdapter } from './woocommerce/selling.js';

export type CommerceCredentials = {
  'shopify-admin'?: string | undefined;
  printify?: string | undefined;
  'amazon-sp-api'?: string | undefined;
  alibaba?: string | undefined;
};

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
      case 'amazon': {
        const adapter = createAmazonSellingAdapter({
          ...(channel.region ? { region: channel.region } : {}),
          ...(credentials['amazon-sp-api']
            ? { refreshToken: credentials['amazon-sp-api'] }
            : {}),
        });
        selling.set('amazon', adapter);
        stubAdapters.push('amazon');
        break;
      }
      case 'woocommerce': {
        const adapter = createWooCommerceSellingAdapter({
          ...(channel.storeUrl ? { storeUrl: channel.storeUrl } : {}),
        });
        selling.set('woocommerce', adapter);
        stubAdapters.push('woocommerce');
        break;
      }
      case 'etsy': {
        // Etsy Open API not yet scaffolded — register nothing until stub lands.
        stubAdapters.push('etsy');
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
      case 'amazon-fba': {
        fulfillment.set('amazon-fba', new AmazonFbaFulfillmentAdapter());
        stubAdapters.push('amazon-fba');
        break;
      }
      case 'amazon-fbm': {
        fulfillment.set('amazon-fbm', new AmazonFbmFulfillmentAdapter());
        stubAdapters.push('amazon-fbm');
        break;
      }
      case 'manual': {
        stubAdapters.push('manual');
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
      case 'alibaba': {
        distributors.set(
          'alibaba',
          createAlibabaDistributorAdapter({
            ...(channel.preferredCurrency
              ? { preferredCurrency: channel.preferredCurrency }
              : {}),
          }),
        );
        stubAdapters.push('alibaba');
        break;
      }
      case 'printify': {
        // Cost catalog remains in shopify-admin; distributor role reserved for PO handoff.
        stubAdapters.push('printify-distributor');
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
