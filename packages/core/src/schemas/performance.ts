import { z } from 'zod';

/**
 * Performance signals — schema for the PSI / CrUX data the audit pipeline
 * pulls from Google APIs (B1).
 *
 * Lab data (PageSpeed Insights / Lighthouse) is fetched from
 * `pagespeedonline.googleapis.com`. Field data (CrUX) is fetched from
 * `chromeuxreport.googleapis.com`. Both are public APIs with no key
 * required for modest usage; high-volume callers should BYO Google API key.
 *
 * These signals feed the `core_web_vitals` rubric category. They are NOT
 * used to compute the audit score on their own — they enrich the
 * storefront-side Lighthouse-style signals the rest of the audit already
 * has, and they let the report distinguish "good in the lab" from "good
 * for real users" without making any claim about which one matters more.
 */

export const PerformanceSource = z.enum([
  'psi_mobile',
  'psi_desktop',
  'crux_phone',
  'crux_desktop',
]);
export type PerformanceSource = z.infer<typeof PerformanceSource>;

/** Web Vitals numeric metric in milliseconds (or unitless for CLS). */
export const MetricMs = z
  .object({
    /** p50 value as reported by the source. */
    p50: z.number().nonnegative(),
    /** "Good" threshold (p50 below this is considered passing). May be
     *  absent when the source doesn't publish thresholds. */
    good: z.number().nonnegative().optional(),
    /** "Poor" threshold (p50 above this is considered failing). */
    poor: z.number().nonnegative().optional(),
  })
  .strict();
export type MetricMs = z.infer<typeof MetricMs>;

export const MetricScore = z
  .object({
    /** Score 0-1; 1 is perfect. CLS-style metrics. */
    score: z.number().min(0).max(1),
  })
  .strict();
export type MetricScore = z.infer<typeof MetricScore>;

export const PerformanceSignal = z
  .object({
    source: PerformanceSource,
    /** True when the source returned a record for this URL. False when
     *  CrUX has no data (site isn't in the top ~10k origins) or PSI timed
     *  out and the caller asked for a non-blocking fetch. */
    available: z.boolean(),
    largestContentfulPaint: MetricMs.optional(),
    cumulativeLayoutShift: MetricScore.optional(),
    firstContentfulPaint: MetricMs.optional(),
    totalBlockingTime: MetricMs.optional(),
    interactionToNextPaint: MetricMs.optional(),
    /** Human-readable reason when `available` is false (e.g. "no CrUX record"). */
    note: z.string().max(500).optional(),
  })
  .strict();
export type PerformanceSignal = z.infer<typeof PerformanceSignal>;

export const PerformanceSignalsOutput = z
  .object({
    /** The URL that was checked. */
    url: z.string().url(),
    signals: z.array(PerformanceSignal),
    fetchedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type PerformanceSignalsOutput = z.infer<typeof PerformanceSignalsOutput>;

/**
 * Map a p50 + good/poor thresholds to a coarse 0-100 score for the rubric.
 * Pure function — same inputs always produce the same score, so the audit
 * pipeline can re-derive without persisting the score itself.
 */
export const scoreMetric = (m: MetricMs): number => {
  if (m.good !== undefined && m.p50 <= m.good) return 100;
  if (m.poor !== undefined && m.p50 >= m.poor) return 0;
  if (m.good === undefined || m.poor === undefined) {
    // No thresholds: degrade gracefully to a 0-100 based on 4s = 0, 0s = 100.
    return Math.max(0, Math.min(100, Math.round(100 - (m.p50 / 4000) * 100)));
  }
  const range = m.poor - m.good;
  const ratio = (m.p50 - m.good) / range;
  return Math.max(0, Math.min(100, Math.round(100 - ratio * 100)));
};
