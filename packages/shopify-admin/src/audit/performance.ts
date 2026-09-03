/**
 * B1 — PSI / CrUX fetchers.
 *
 * Two Google public APIs:
 *   * PageSpeed Insights v5 (Lighthouse lab data):
 *     `GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
 *   * CrUX (Chrome User Experience Report, real-user field data):
 *     `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord`
 *
 * Both accept an optional `apiKey` (BYOK for high-volume usage). The
 * fetchers return a `PerformanceSignal` per source, or an unavailable
 * signal with a `note` when the API didn't return data (CrUX has no
 * record for ~99% of small Shopify stores — that's expected, not an
 * error).
 *
 * No retries. No caching. The audit worker calls these per intent; the
 * scores are pure functions of the returned data so re-deriving is free.
 */

import type { PerformanceSignal, PerformanceSignalsOutput } from '@steadyflow/core/schemas';

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CRUX_BASE = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchOptions {
  /** Optional Google API key (BYOK). */
  apiKey?: string;
  /** Per-fetch timeout in ms. Default 15s. */
  timeoutMs?: number;
  /** Override the global `fetch` (for testing). */
  fetchImpl?: typeof fetch;
}

const withTimeout = (ms: number, fetchImpl: typeof fetch): typeof fetch => {
  return (input, init) =>
    Promise.race([
      fetchImpl(input, init),
      new Promise<Response>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Fetch timed out after ${ms}ms`));
        }, ms),
      ),
    ]);
};

interface LighthouseNumericAudit {
  numericValue?: number;
  score?: number | null;
}
interface LighthouseResult {
  audits?: Record<string, LighthouseNumericAudit | undefined>;
}
interface PsiResponse {
  lighthouseResult?: LighthouseResult;
}

/**
 * Fetch PageSpeed Insights lab data for a URL.
 * Returns `{ available: false }` on any non-2xx, parse failure, or timeout
 * — the audit pipeline treats unavailable lab data the same as no lab
 * data, never as a hard failure.
 */
export const fetchPageSpeedInsights = async (
  url: string,
  strategy: 'mobile' | 'desktop',
  options: FetchOptions = {},
): Promise<PerformanceSignal> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const f = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, fetchImpl);

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
  });
  if (options.apiKey) params.set('key', options.apiKey);

  try {
    const res = await f(`${PSI_BASE}?${params.toString()}`);
    if (!res.ok) {
      return {
        source: strategy === 'mobile' ? 'psi_mobile' : 'psi_desktop',
        available: false,
        note: `PSI HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as PsiResponse;
    const audits = body.lighthouseResult?.audits ?? {};

    // Map Lighthouse audit IDs → our normalized metrics.
    const lcpMs = audits['largest-contentful-paint']?.numericValue;
    const clsScore = audits['cumulative-layout-shift']?.score;
    const clsNumeric = audits['cumulative-layout-shift']?.numericValue;
    const fcpMs = audits['first-contentful-paint']?.numericValue;
    const tbtMs = audits['total-blocking-time']?.numericValue;

    return {
      source: strategy === 'mobile' ? 'psi_mobile' : 'psi_desktop',
      available: true,
      ...(typeof lcpMs === 'number'
        ? { largestContentfulPaint: { p50: lcpMs, good: 2500, poor: 4000 } }
        : {}),
      ...(typeof clsNumeric === 'number' && typeof clsScore === 'number'
        ? { cumulativeLayoutShift: { score: clsScore } }
        : {}),
      ...(typeof fcpMs === 'number'
        ? { firstContentfulPaint: { p50: fcpMs, good: 1800, poor: 3000 } }
        : {}),
      ...(typeof tbtMs === 'number'
        ? { totalBlockingTime: { p50: tbtMs, good: 200, poor: 600 } }
        : {}),
    };
  } catch (err) {
    return {
      source: strategy === 'mobile' ? 'psi_mobile' : 'psi_desktop',
      available: false,
      note: `PSI fetch failed: ${(err as Error).message}`,
    };
  }
};

interface CruxMetric {
  percentiles?: { p50?: number | number[] };
}
interface CruxHistogramBin {
  start: number;
  end?: number;
  density?: number;
}
interface CruxRecord {
  metrics?: Record<
    string,
    { histogram?: CruxHistogramBin[]; percentiles?: CruxMetric['percentiles'] }
  >;
}
interface CruxResponse {
  record?: CruxRecord;
  error?: { message?: string; status?: string };
}

/**
 * Fetch CrUX field data for a URL. Returns `available: false` with a
 * `note` when the URL is not in the CrUX dataset (most common case for
 * small Shopify stores).
 */
export const fetchCrUX = async (
  url: string,
  formFactor: 'phone' | 'desktop',
  options: FetchOptions = {},
): Promise<PerformanceSignal> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const f = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, fetchImpl);

  try {
    const res = await f(
      `${CRUX_BASE}${options.apiKey ? `?key=${encodeURIComponent(options.apiKey)}` : ''}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url,
          formFactor: formFactor === 'phone' ? 'PHONE' : 'DESKTOP',
          metrics: [
            'largest_contentful_paint',
            'cumulative_layout_shift',
            'first_contentful_paint',
            'interaction_to_next_paint',
          ],
        }),
      },
    );
    if (!res.ok) {
      return {
        source: formFactor === 'phone' ? 'crux_phone' : 'crux_desktop',
        available: false,
        note: `CrUX HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as CruxResponse;
    if (!body.record) {
      return {
        source: formFactor === 'phone' ? 'crux_phone' : 'crux_desktop',
        available: false,
        note: body.error?.message ?? 'no CrUX record for this URL',
      };
    }
    const metrics = body.record.metrics ?? {};
    const lcp = metrics.largest_contentful_paint?.percentiles?.p50;
    const cls = metrics.cumulative_layout_shift?.histogram;
    const fcp = metrics.first_contentful_paint?.percentiles?.p50;
    const inp = metrics.interaction_to_next_paint?.percentiles?.p50;

    // CLS in CrUX is reported as a histogram of "good / needs improvement / poor"
    // densities. Reconstruct a coarse score from the good+needs-improvement share
    // so the audit can show a number; the strict p50 isn't meaningful for CLS.
    let clsScore: number | undefined;
    if (cls && cls.length > 0) {
      const total = cls.reduce((s, b) => s + (b.density ?? 0), 0);
      const goodBin = cls.find((b) => b.start === 0 && b.end === 0.1);
      const good = (goodBin?.density ?? 0) + (cls.find((b) => b.start === 0.1)?.density ?? 0);
      clsScore = total > 0 ? good / total : undefined;
    }

    return {
      source: formFactor === 'phone' ? 'crux_phone' : 'crux_desktop',
      available: true,
      ...(typeof lcp === 'number'
        ? { largestContentfulPaint: { p50: lcp, good: 2500, poor: 4000 } }
        : {}),
      ...(clsScore !== undefined ? { cumulativeLayoutShift: { score: clsScore } } : {}),
      ...(typeof fcp === 'number'
        ? { firstContentfulPaint: { p50: fcp, good: 1800, poor: 3000 } }
        : {}),
      ...(typeof inp === 'number'
        ? { interactionToNextPaint: { p50: inp, good: 200, poor: 500 } }
        : {}),
    };
  } catch (err) {
    return {
      source: formFactor === 'phone' ? 'crux_phone' : 'crux_desktop',
      available: false,
      note: `CrUX fetch failed: ${(err as Error).message}`,
    };
  }
};

/**
 * Fetch all four signals (mobile PSI, desktop PSI, phone CrUX, desktop
 * CrUX) in parallel. The audit pipeline calls this; never one at a time.
 */
export const fetchPerformanceSignals = async (
  url: string,
  options: FetchOptions = {},
): Promise<PerformanceSignalsOutput> => {
  const [mobile, desktop, phoneCrux, desktopCrux] = await Promise.all([
    fetchPageSpeedInsights(url, 'mobile', options),
    fetchPageSpeedInsights(url, 'desktop', options),
    fetchCrUX(url, 'phone', options),
    fetchCrUX(url, 'desktop', options),
  ]);
  return {
    url,
    signals: [mobile, desktop, phoneCrux, desktopCrux],
    fetchedAt: new Date().toISOString(),
  };
};
