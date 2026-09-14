import { AdapterNotImplementedError, type FulfillmentAdapter } from '../types.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import type { CommerceOrder } from '../../schemas/order.js';

/**
 * Amazon FBA fulfillment adapter (AFN).
 * FBA orders are fulfilled by Amazon automatically — submitting an order here
 * validates AFN routing and confirms acceptance for the autoFulfill pipeline.
 * Inventory truth lives in the FBA Inventory API (via AmazonSellingAdapter).
 */
export class AmazonFbaFulfillmentAdapter implements FulfillmentAdapter {
  readonly meta = {
    id: 'amazon-fba' as const,
    role: 'fulfillment' as const,
    stub: false,
    capabilities: ['submit_fulfillment', 'list_inventory'] as const,
  };

  submitFulfillment(
    order: CommerceOrder,
  ): Promise<{ accepted: boolean; externalId?: string; message?: string }> {
    if (order.platform === 'amazon' && order.fulfillmentProvider !== 'amazon-fbm') {
      return Promise.resolve({
        accepted: true,
        externalId: order.externalId,
        message: `FBA order ${order.externalId} routed; Amazon fulfills AFN orders automatically`,
      });
    }
    return Promise.resolve({
      accepted: false,
      message: `Order ${order.externalId} is not an Amazon FBA order (platform ${order.platform}); route it to its selling platform's fulfillment provider`,
    });
  }

  listInventory(): Promise<CommerceInventoryLevel[]> {
    // FBA stock is read through AmazonSellingAdapter.listInventory (FBA Inventory API).
    return Promise.reject(new AdapterNotImplementedError('amazon-fba', 'list_inventory'));
  }
}

/**
 * Amazon FBM / merchant-fulfilled readiness gap (MFN).
 * Merchant Fulfillment API shipment creation requires live shipping-service
 * selection — intentionally not implemented until wired.
 */
export class AmazonFbmFulfillmentAdapter implements FulfillmentAdapter {
  readonly meta = {
    id: 'amazon-fbm' as const,
    role: 'fulfillment' as const,
    stub: true,
    capabilities: ['submit_fulfillment'] as const,
  };

  submitFulfillment(_order: CommerceOrder): Promise<{ accepted: boolean; message?: string }> {
    return Promise.reject(new AdapterNotImplementedError('amazon-fbm', 'submit_fulfillment'));
  }
}
