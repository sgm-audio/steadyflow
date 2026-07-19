import type {
  DistributorHandoffResult,
  DistributorOffer,
  DistributorOrderHandoff,
} from '../../schemas/distributor.js';
import { AdapterNotImplementedError, type DistributorAdapter } from '../types.js';

export interface AlibabaDistributorAdapterOptions {
  /** Alibaba Open Platform app key / seller account id when live. */
  accountId?: string | undefined;
  preferredCurrency?: string | undefined;
}

/**
 * Alibaba distributor readiness stub.
 *
 * Intended flow:
 * 1. Search / import supplier offers (title, MOQ, unit cost, lead time)
 * 2. Map offers → internal SKUs / Printify blanks / Amazon ASINs
 * 3. Handoff POs with idempotency keys when restocking or custom runs
 */
export class AlibabaDistributorAdapter implements DistributorAdapter {
  readonly meta = {
    id: 'alibaba' as const,
    role: 'distributor' as const,
    stub: true,
    capabilities: ['list_offers', 'handoff_order'] as const,
  };

  readonly options: AlibabaDistributorAdapterOptions;

  constructor(opts: AlibabaDistributorAdapterOptions = {}) {
    this.options = opts;
  }

  async listOffers(query?: { q?: string; limit?: number }): Promise<DistributorOffer[]> {
    void query;
    void this.options;
    throw new AdapterNotImplementedError('alibaba', 'list_offers');
  }

  async handoffOrder(_req: DistributorOrderHandoff): Promise<DistributorHandoffResult> {
    throw new AdapterNotImplementedError('alibaba', 'handoff_order');
  }
}

export function createAlibabaDistributorAdapter(
  opts?: AlibabaDistributorAdapterOptions,
): AlibabaDistributorAdapter {
  return new AlibabaDistributorAdapter(opts ?? {});
}
