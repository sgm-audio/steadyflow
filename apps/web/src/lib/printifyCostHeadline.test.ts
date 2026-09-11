import { describe, expect, it } from 'vitest';
import { hasPrintifyCostHeadline, parsePrintifyCostHeadline } from './printifyCostHeadline';

describe('parsePrintifyCostHeadline', () => {
  it('returns nulls when nothing matches', () => {
    expect(parsePrintifyCostHeadline({ findings: [] })).toEqual({
      avgMarginPct: null,
      recoverableAnnual: null,
      breakEvenRoas: null,
    });
  });

  it('parses leak-list title and catalog-margin body', () => {
    const h = parsePrintifyCostHeadline({
      findings: [
        {
          title: 'Revenue Leak List — ~$12,400/yr recoverable (estimated)',
          body: 'Ranked by estimated annual recoverable revenue.',
        },
        {
          title: 'Catalog margin summary',
          body: 'Average gross margin: 32.1% across 14 priced product(s) (CAD).',
        },
      ],
    });
    expect(h.recoverableAnnual).toBe(12400);
    expect(h.avgMarginPct).toBe(32.1);
    expect(h.breakEvenRoas).toBeNull();
    expect(hasPrintifyCostHeadline(h)).toBe(true);
  });

  it('prefers firstSalePlan margin and ROAS over parsed body', () => {
    const h = parsePrintifyCostHeadline({
      findings: [
        {
          title: 'Catalog margin summary',
          body: 'Average gross margin: 32.1% across 14 priced product(s) (CAD).',
        },
      ],
      firstSalePlan: { grossMarginPct: 28, breakEvenRoas: 3.6 },
    });
    expect(h.avgMarginPct).toBe(28);
    expect(h.breakEvenRoas).toBe(3.6);
  });
});
