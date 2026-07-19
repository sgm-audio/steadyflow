import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import { AdapterNotImplementedError, type FulfillmentAdapter } from '../types.js';

/**
 * Amazon FBA fulfillment readiness stub (AFN).
 * Pair with AmazonSellingAdapter; inventory truth lives in FBA Inventory API.
 */
export class AmazonFbaFulfillmentAdapter implements FulfillmentAdapter {
  readonly meta = {
    id: 'amazon-fba' as const,
    role: 'fulfillment' as const,
    stub: true,
    capabilities: ['submit_fulfillment', 'list_inventory'] as const,
  };

  async submitFulfillment(_order: CommerceOrder): Promise<{ accepted: boolean; message?: string }> {
    throw new AdapterNotImplementedError('amazon-fba', 'submit_fulfillment');
  }

  async listInventory(): Promise<CommerceInventoryLevel[]> {
    throw new AdapterNotImplementedError('amazon-fba', 'list_inventory');
  }
}

/**
 * Amazon FBM / merchant-fulfilled readiness stub (MFN).
 */
export class AmazonFbmFulfillmentAdapter implements FulfillmentAdapter {
  readonly meta = {
    id: 'amazon-fbm' as const,
    role: 'fulfillment' as const,
    stub: true,
    capabilities: ['submit_fulfillment'] as const,
  };

  async submitFulfillment(_order: CommerceOrder): Promise<{ accepted: boolean; message?: string }> {
    throw new AdapterNotImplementedError('amazon-fbm', 'submit_fulfillment');
  }
}
