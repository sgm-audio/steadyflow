import { describe, expect, it } from 'vitest';
import { fetchCrUX, fetchPageSpeedInsights, fetchPerformanceSignals } from './performance.js';

const mockFetch = (
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch => {
  return ((input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : new URL(input as URL).toString();
    return responder(url, init);
  }) as typeof fetch;
};

describe('fetchPageSpeedInsights', () => {
  it('returns an unavailable signal when PSI returns 500', async () => {
    const fetchImpl = mockFetch(() => new Response('boom', { status: 500 }));
    const r = await fetchPageSpeedInsights('https://example.myshopify.com', 'mobile', {
      fetchImpl,
    });
    expect(r.available).toBe(false);
    expect(r.source).toBe('psi_mobile');
    expect(r.note).toContain('500');
  });

  it('returns an unavailable signal on timeout', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Fetch timed out after 50ms'));
          }, 10);
        }),
    );
    const r = await fetchPageSpeedInsights('https://example.myshopify.com', 'desktop', {
      fetchImpl,
      timeoutMs: 50,
    });
    expect(r.available).toBe(false);
    expect(r.note).toMatch(/timed out/i);
  });

  it('parses a healthy PSI mobile response', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            lighthouseResult: {
              audits: {
                'largest-contentful-paint': { numericValue: 2100, score: 0.9 },
                'cumulative-layout-shift': { numericValue: 0.05, score: 1.0 },
                'first-contentful-paint': { numericValue: 1500, score: 1.0 },
                'total-blocking-time': { numericValue: 150, score: 0.95 },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const r = await fetchPageSpeedInsights('https://example.myshopify.com', 'mobile', {
      fetchImpl,
    });
    expect(r.available).toBe(true);
    expect(r.source).toBe('psi_mobile');
    expect(r.largestContentfulPaint?.p50).toBe(2100);
    expect(r.cumulativeLayoutShift?.score).toBe(1.0);
  });

  it('handles missing audits without crashing', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ lighthouseResult: { audits: {} } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const r = await fetchPageSpeedInsights('https://example.myshopify.com', 'mobile', {
      fetchImpl,
    });
    expect(r.available).toBe(true);
    expect(r.largestContentfulPaint).toBeUndefined();
  });
});

describe('fetchCrUX', () => {
  it('returns an unavailable signal when CrUX has no record (common case)', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'No data' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const r = await fetchCrUX('https://small-shop.myshopify.com', 'phone', { fetchImpl });
    expect(r.available).toBe(false);
    expect(r.source).toBe('crux_phone');
  });

  it('parses a CrUX record with histogram into a CLS score', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            record: {
              metrics: {
                largest_contentful_paint: { percentiles: { p50: 2400 } },
                cumulative_layout_shift: {
                  histogram: [
                    { start: 0, end: 0.1, density: 0.7 },
                    { start: 0.1, end: 0.25, density: 0.2 },
                    { start: 0.25, density: 0.1 },
                  ],
                },
                first_contentful_paint: { percentiles: { p50: 1600 } },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const r = await fetchCrUX('https://example.myshopify.com', 'phone', { fetchImpl });
    expect(r.available).toBe(true);
    expect(r.largestContentfulPaint?.p50).toBe(2400);
    // Good + needs-improvement = 0.7 + 0.2 = 0.9
    expect(r.cumulativeLayoutShift?.score).toBeCloseTo(0.9, 2);
  });
});

describe('fetchPerformanceSignals', () => {
  it('fetches all four sources in parallel and aggregates', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.includes('pagespeedonline')) {
        return new Response(
          JSON.stringify({
            lighthouseResult: {
              audits: { 'largest-contentful-paint': { numericValue: 2500, score: 0.85 } },
            },
          }),
          { status: 200 },
        );
      }
      // CrUX — return no record for both form factors.
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    });
    const r = await fetchPerformanceSignals('https://example.myshopify.com', { fetchImpl });
    expect(r.signals).toHaveLength(4);
    const sources = r.signals.map((s) => s.source);
    expect(sources).toEqual(['psi_mobile', 'psi_desktop', 'crux_phone', 'crux_desktop']);
    // Two PSI hits, two CrUX misses.
    expect(r.signals.filter((s) => s.available)).toHaveLength(2);
  });

  it('does not crash when all four sources fail', async () => {
    const fetchImpl = mockFetch(() => new Response('boom', { status: 503 }));
    const r = await fetchPerformanceSignals('https://example.myshopify.com', { fetchImpl });
    expect(r.signals.every((s) => !s.available)).toBe(true);
    expect(typeof r.fetchedAt).toBe('string');
  });

  it('passes through the apiKey when provided', async () => {
    const seen: string[] = [];
    const fetchImpl = mockFetch((url) => {
      seen.push(url);
      return new Response(JSON.stringify({}), { status: 200 });
    });
    await fetchPageSpeedInsights('https://example.myshopify.com', 'mobile', {
      fetchImpl,
      apiKey: 'test-key',
    });
    expect(seen[0]).toContain('key=test-key');
  });
});
