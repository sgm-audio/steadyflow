import { describe, expect, it } from 'vitest';
import {
  buildFirstSalePlaybook,
  computeAiReadiness,
  computeFirstSaleMath,
  type PageSeoSignals,
} from './playbook.js';

const baseSignals = (overrides: Partial<PageSeoSignals> = {}): PageSeoSignals => ({
  hasMetaDescription: false,
  metaDescriptionLength: 0,
  hasStructuredData: false,
  hasSitemap: false,
  hasRobotsTxt: false,
  allowsOaiSearchBot: false,
  allowsPerplexityBot: false,
  hasProductSchema: false,
  hasGtin: false,
  ...overrides,
});

describe('computeAiReadiness', () => {
  it('starts from the Shopify baseline of 50', () => {
    const readiness = computeAiReadiness(baseSignals(), { totalProducts: 1 });
    expect(readiness.score).toBe(50);
  });

  it('caps the score at 100', () => {
    const readiness = computeAiReadiness(
      baseSignals({
        hasProductSchema: true,
        hasGtin: true,
        allowsOaiSearchBot: true,
        allowsPerplexityBot: true,
        hasSitemap: true,
        hasMetaDescription: true,
      }),
      { totalProducts: 1 },
    );
    expect(readiness.score).toBe(100);
  });

  it('awards the documented per-signal points', () => {
    expect(
      computeAiReadiness(baseSignals({ hasProductSchema: true }), { totalProducts: 1 }).score,
    ).toBe(65);
    expect(computeAiReadiness(baseSignals({ hasGtin: true }), { totalProducts: 1 }).score).toBe(60);
    expect(
      computeAiReadiness(baseSignals({ allowsOaiSearchBot: true }), { totalProducts: 1 }).score,
    ).toBe(60);
    expect(
      computeAiReadiness(baseSignals({ allowsPerplexityBot: true }), { totalProducts: 1 }).score,
    ).toBe(55);
    expect(computeAiReadiness(baseSignals({ hasSitemap: true }), { totalProducts: 1 }).score).toBe(
      55,
    );
    expect(
      computeAiReadiness(baseSignals({ hasMetaDescription: true }), { totalProducts: 1 }).score,
    ).toBe(55);
  });

  it('flags Shopify stores as auto-integrated with Shop Pay', () => {
    const readiness = computeAiReadiness(baseSignals(), { totalProducts: 1 });
    expect(readiness.chatgptShopping).toBe(true);
    expect(readiness.shopPayEnabled).toBe(true);
    expect(readiness.merchantCenterConnected).toBe(false);
  });
});

describe('computeFirstSaleMath', () => {
  const rows = (marginPct: number | null) => ({ rows: [{ margin: { marginPct } }] });

  it('returns null when no row has margin data', () => {
    expect(computeFirstSaleMath({ rows: [] })).toBeNull();
    expect(computeFirstSaleMath(rows(null))).toBeNull();
  });

  it('picks Google Shopping + Meta for high margins (>= 60%)', () => {
    const math = computeFirstSaleMath(rows(70));
    expect(math?.recommendedChannel).toBe('Google Shopping + Meta');
    expect(math?.recommendedCpc).toBe(4.44);
    expect(math?.breakEvenRoas).toBeCloseTo(1.4, 1);
  });

  it('picks Meta for mid margins (25-59%)', () => {
    const math = computeFirstSaleMath(rows(40));
    expect(math?.recommendedChannel).toBe('Meta (Facebook/Instagram)');
    expect(math?.recommendedCpc).toBe(0.45);
    expect(math?.breakEvenRoas).toBeCloseTo(2.5, 1);
  });

  it('picks TikTok Spark Ads for low margins (< 25%)', () => {
    const math = computeFirstSaleMath(rows(20));
    expect(math?.recommendedChannel).toBe('TikTok Spark Ads');
    expect(math?.recommendedCpc).toBe(0.5);
  });

  it('defaults break-even ROAS to 4.0 when margin is non-positive', () => {
    const math = computeFirstSaleMath(rows(0));
    expect(math?.breakEvenRoas).toBe(4);
  });

  it('computes clicks and daily budget deterministically', () => {
    const math = computeFirstSaleMath(rows(40));
    expect(math?.clicksForFirstSale).toBe(50); // 1 / 2% conversion
    expect(math?.estimatedFirstSaleCost).toBe(23); // 50 * $0.45, rounded
    expect(math?.dailyBudget).toBe(10); // max(10, round(23/3))
  });
});

describe('buildFirstSalePlaybook', () => {
  const readiness = computeAiReadiness(baseSignals({ hasProductSchema: true }), {
    totalProducts: 1,
  });

  it('always emits day-1, week-1, week-2, and month-1 actions', () => {
    const playbook = buildFirstSalePlaybook(readiness, null, 'Test Store');
    const channels = (playbook.actions as { channel: string }[]).map((a) => a.channel);
    expect(channels).toContain('etsy');
    expect(channels).toContain('tiktok');
    expect(channels).toContain('creators');
    expect(channels).toContain('pinterest');
  });

  it('includes the ads action only when first-sale math is available', () => {
    const withoutMath = buildFirstSalePlaybook(readiness, null, 'Test Store');
    const channels = (withoutMath.actions as { channel: string }[]).map((a) => a.channel);
    expect(channels).not.toContain('ads');

    const math = computeFirstSaleMath({ rows: [{ margin: { marginPct: 40 } }] });
    const withMath = buildFirstSalePlaybook(readiness, math, 'Test Store');
    expect((withMath.actions as { channel: string }[]).map((a) => a.channel)).toContain('ads');
    expect(withMath.recommendedChannel).toBe('Meta (Facebook/Instagram)');
  });

  it('tags the plan with the store name', () => {
    const playbook = buildFirstSalePlaybook(readiness, null, 'Making Madi');
    expect(playbook.generatedForStore).toBe('Making Madi');
  });

  it('serializes the AI-platforms audit into the plan', () => {
    const playbook = buildFirstSalePlaybook(readiness, null, 'Test Store');
    const audit = playbook.aiPlatformsAudit as { productSchemaPresent: boolean };
    expect(audit.productSchemaPresent).toBe(true);
  });
});
