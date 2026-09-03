import { describe, expect, it } from 'vitest';
import {
  computeCoverageScore,
  TRACKING_PROVIDER_WEIGHTS,
  TrackingCheck,
  TrackingProvider,
  TrackingVerificationOutput,
} from './tracking.js';

describe('TrackingProvider', () => {
  it('accepts known providers', () => {
    expect(TrackingProvider.parse('ga4')).toBe('ga4');
    expect(TrackingProvider.parse('meta_pixel')).toBe('meta_pixel');
  });

  it('rejects unknown providers', () => {
    expect(() => TrackingProvider.parse('mixpanel')).toThrow();
  });
});

describe('TrackingCheck', () => {
  it('accepts a detected check with evidence', () => {
    const r = TrackingCheck.parse({
      provider: 'ga4',
      detected: true,
      evidence: 'gtag("config", "G-XXXXXXX")',
      source: 'homepage_script',
      id: 'G-XXXXXXX',
    });
    expect(r.detected).toBe(true);
    expect(r.id).toBe('G-XXXXXXX');
  });

  it('accepts an undetected check without evidence', () => {
    const r = TrackingCheck.parse({
      provider: 'meta_pixel',
      detected: false,
      source: 'homepage_script',
    });
    expect(r.detected).toBe(false);
  });

  it('rejects detected: true with no evidence', () => {
    expect(() =>
      TrackingCheck.parse({
        provider: 'ga4',
        detected: true,
        source: 'homepage_script',
      }),
    ).toThrow(/evidence is required/);
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(() =>
      TrackingCheck.parse({
        provider: 'ga4',
        detected: false,
        source: 'homepage_script',
        surprise: true,
      }),
    ).toThrow();
  });
});

describe('TRACKING_PROVIDER_WEIGHTS', () => {
  it('sums to exactly 100', () => {
    const total = Object.values(TRACKING_PROVIDER_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
  });

  it('has a weight for every TrackingProvider', () => {
    for (const p of TrackingProvider.options) {
      expect(TRACKING_PROVIDER_WEIGHTS[p]).toBeGreaterThan(0);
    }
  });
});

describe('computeCoverageScore', () => {
  it('returns 0 when nothing is detected', () => {
    const checks = TrackingProvider.options.map((p) => ({
      provider: p,
      detected: false,
      source: 'homepage_script' as const,
    }));
    expect(computeCoverageScore(checks)).toBe(0);
  });

  it('sums weights of detected providers', () => {
    const checks = [
      {
        provider: 'ga4' as const,
        detected: true,
        source: 'homepage_script' as const,
        evidence: 'gtag',
      },
      {
        provider: 'shopify_analytics' as const,
        detected: true,
        source: 'storefront_meta' as const,
        evidence: 'shopify',
      },
      { provider: 'meta_pixel' as const, detected: false, source: 'homepage_script' as const },
    ];
    // 25 (ga4) + 15 (shopify_analytics) = 40
    expect(computeCoverageScore(checks)).toBe(40);
  });

  it('caps at 100', () => {
    // Fabricate a detected entry for every provider; sum of all weights is 100.
    const checks = TrackingProvider.options.map((p) => ({
      provider: p,
      detected: true,
      source: 'homepage_script' as const,
      evidence: 'snippet',
    }));
    expect(computeCoverageScore(checks)).toBe(100);
  });
});

describe('TrackingVerificationOutput', () => {
  it('parses a complete result', () => {
    const r = TrackingVerificationOutput.parse({
      url: 'https://example.myshopify.com',
      checks: [
        {
          provider: 'ga4',
          detected: true,
          evidence: 'gtag("config", "G-XXXXXXX")',
          source: 'homepage_script',
        },
      ],
      coverageScore: 25,
      recommendations: [
        { provider: 'meta_pixel', severity: 'recommended', message: 'Add Meta pixel' },
      ],
      fetchedAt: new Date().toISOString(),
    });
    expect(r.coverageScore).toBe(25);
    expect(r.recommendations).toHaveLength(1);
  });

  it('rejects out-of-range coverage score', () => {
    expect(() =>
      TrackingVerificationOutput.parse({
        url: 'https://example.myshopify.com',
        checks: [],
        coverageScore: 150,
        recommendations: [],
        fetchedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
