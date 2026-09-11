export interface ScoreSnapshot {
  total_score: number;
  grade: string;
  captured_at: string;
}

export interface ScoreDelta {
  previous: ScoreSnapshot;
  current: ScoreSnapshot;
  delta: number;
  direction: 'up' | 'down' | 'flat';
}

export const computeScoreDelta = (
  current: ScoreSnapshot | null | undefined,
  previous: ScoreSnapshot | null | undefined,
): ScoreDelta | null => {
  if (!current || !previous) return null;
  if (!Number.isFinite(current.total_score) || !Number.isFinite(previous.total_score)) return null;
  const delta = current.total_score - previous.total_score;
  let direction: ScoreDelta['direction'] = 'flat';
  if (delta > 0) direction = 'up';
  else if (delta < 0) direction = 'down';
  return { previous, current, delta, direction };
};

export const formatDelta = (delta: number): string => {
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : String(delta);
};
