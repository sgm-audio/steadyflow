import { describe, it, expect } from 'vitest';
import {
  deriveLeakContext,
  aggregateFlags,
  buildLeakList,
  totalEstimatedImpact,
  DEFAULT_MONTHLY_ORDERS,
} from './impact.js';
import type { Flag } from './flags.js';

const red = (code: Flag['code']): Flag => ({ code, severity: 'red', message: 'x' });
const yellow = (code: Flag['code']): Flag => ({ code, severity: 'yellow', message: 'x' });

describe('deriveLeakContext', () => {
  it('derives AOV from priced products', () => {
    const ctx = deriveLeakContext([{ priceMinCAD: 40 }, { priceMinCAD: 60 }], 'CAD');
    expect(ctx.averageOrderValue).toBe(50);
    expect(ctx.monthlyOrders).toBe(DEFAULT_MONTHLY_ORDERS);
    expect(ctx.productCount).toBe(2);
  });

  it('falls back to a default AOV when no priced products', () => {
    const ctx = deriveLeakContext([{ priceMinCAD: 0 }], 'CAD');
    expect(ctx.averageOrderValue).toBe(50);
  });
});

describe('aggregateFlags', () => {
  it('counts affected products and keeps the max severity', () => {
    const map = aggregateFlags([
      { flags: [red('low_margin'), yellow('missing_alt_text')] },
      { flags: [yellow('low_margin')] },
    ]);
    expect(map.get('low_margin')).toEqual({ severity: 'high', affectedCount: 2 });
    expect(map.get('missing_alt_text')).toEqual({ severity: 'medium', affectedCount: 1 });
  });
});

describe('buildLeakList', () => {
  it('ranks leaks by estimated annual impact, descending', () => {
    const rows = [
      { priceMinCAD: 40, flags: [red('low_margin')] },
      { priceMinCAD: 40, flags: [red('low_margin')] },
      { priceMinCAD: 40, flags: [yellow('missing_alt_text')] },
    ];
    const list = buildLeakList(rows, 'CAD', { monthlyOrders: 100 });
    expect(list.length).toBe(2);
    expect(list[0]?.code).toBe('low_margin');
    expect(list[0]?.estimatedAnnualImpact).toBeGreaterThanOrEqual(list[1]?.estimatedAnnualImpact ?? 0);
    // Deterministic ordering: low_margin has the larger coefficient (0.03 vs 0.01).
    expect(list[0]?.code).toBe('low_margin');
  });

  it('excludes informational flags with zero impact', () => {
    const list = buildLeakList([{ priceMinCAD: 40, flags: [yellow('on_sale')] }], 'CAD');
    expect(list).toEqual([]);
  });

  it('scales impact by affected breadth', () => {
    // One low-margin product in a 10-product store → 1/10 of the full coefficient.
    const narrow = buildLeakList(
      [
        { priceMinCAD: 40, flags: [red('low_margin')] },
        ...Array.from({ length: 9 }, () => ({ priceMinCAD: 40, flags: [] as Flag[] })),
      ],
      'CAD',
      { monthlyOrders: 100 },
    );
    const wide = buildLeakList(
      Array.from({ length: 10 }, () => ({ priceMinCAD: 40, flags: [red('low_margin')] })),
      'CAD',
      { monthlyOrders: 100 },
    );
    const narrowImpact = narrow.find((i) => i.code === 'low_margin')?.estimatedAnnualImpact ?? 0;
    const wideImpact = wide.find((i) => i.code === 'low_margin')?.estimatedAnnualImpact ?? 0;
    expect(wideImpact).toBeGreaterThan(narrowImpact);
  });

  it('uses real sales data when provided (overrides assumptions)', () => {
    const rows = [{ priceMinCAD: 40, flags: [red('low_margin')] }];
    const assumed = buildLeakList(rows, 'CAD');
    const real = buildLeakList(rows, 'CAD', { sales: { averageOrderValue: 100, monthlyOrders: 500 } });
    expect(real[0]?.estimatedAnnualImpact).toBeGreaterThan(assumed[0]?.estimatedAnnualImpact ?? 0);
    expect(real[0]?.basis).toContain('real order data');
    expect(assumed[0]?.basis).toContain('assumed');
  });
});

describe('totalEstimatedImpact', () => {
  it('sums the leak list', () => {
    const items = [
      { code: 'low_margin' as const, title: 't', severity: 'high' as const, affectedCount: 1, rubricCategory: 'cost_margin' as const, estimatedAnnualImpact: 100, basis: '' },
      { code: 'missing_alt_text' as const, title: 't', severity: 'medium' as const, affectedCount: 1, rubricCategory: 'technical_seo' as const, estimatedAnnualImpact: 50, basis: '' },
    ];
    expect(totalEstimatedImpact(items)).toBe(150);
  });
});
