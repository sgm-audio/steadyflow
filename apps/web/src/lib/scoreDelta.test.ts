import { describe, expect, it } from 'vitest';
import { computeScoreDelta, formatDelta } from './scoreDelta';

const snap = (score: number, iso = '2026-09-10T00:00:00.000Z', grade = 'B') => ({
  total_score: score,
  grade,
  captured_at: iso,
});

describe('computeScoreDelta', () => {
  it('returns null when previous is null (first audit hides block)', () => {
    expect(computeScoreDelta(snap(150), null)).toBeNull();
    expect(computeScoreDelta(null, snap(140))).toBeNull();
    expect(computeScoreDelta(null, null)).toBeNull();
  });

  it('computes positive delta and up direction', () => {
    const d = computeScoreDelta(snap(160), snap(140));
    expect(d?.delta).toBe(20);
    expect(d?.direction).toBe('up');
  });

  it('computes negative delta and down direction', () => {
    const d = computeScoreDelta(snap(130), snap(150));
    expect(d?.delta).toBe(-20);
    expect(d?.direction).toBe('down');
  });

  it('reports flat when scores equal', () => {
    const d = computeScoreDelta(snap(150), snap(150));
    expect(d?.delta).toBe(0);
    expect(d?.direction).toBe('flat');
  });

  it('returns null on non-finite scores', () => {
    expect(
      computeScoreDelta(
        { total_score: Number.NaN, grade: 'A', captured_at: '2026-09-10T00:00:00.000Z' },
        snap(100),
      ),
    ).toBeNull();
  });

  it('carries through grade and captured_at', () => {
    const cur = snap(170, '2026-09-11T10:00:00.000Z', 'B');
    const prev = snap(150, '2026-09-10T10:00:00.000Z', 'C');
    const d = computeScoreDelta(cur, prev);
    expect(d?.current.grade).toBe('B');
    expect(d?.previous.grade).toBe('C');
    expect(d?.current.captured_at).toBe('2026-09-11T10:00:00.000Z');
  });
});

describe('formatDelta', () => {
  it('formats zero as ±0', () => {
    expect(formatDelta(0)).toBe('±0');
  });
  it('prefixes positive with +', () => {
    expect(formatDelta(12)).toBe('+12');
  });
  it('leaves negative as is', () => {
    expect(formatDelta(-7)).toBe('-7');
  });
});
