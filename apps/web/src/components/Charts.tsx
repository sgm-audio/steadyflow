/**
 * Minimal inline SVG chart primitives — no chart library dependency.
 *
 * Keeps the bundle small and avoids a client-side dependency for what
 * amounts to a single-ring + bar rendering. Both are server-renderable.
 */

export function ScoreRing({
  score,
  size = 96,
  strokeWidth = 8,
  label,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 75 ? '#34d399' : clamped >= 50 ? '#fbbf24' : '#f87171';
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${clamped} out of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#27272a"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.28}
        fontWeight={700}
        fill="#e4e4e7"
      >
        {clamped}
      </text>
    </svg>
  );
}

export function CategoryBar({
  categories,
}: {
  categories: { label: string; count: number; color: string }[];
}) {
  if (categories.length === 0) return null;
  const max = Math.max(...categories.map((c) => c.count), 1);
  const rowHeight = 22;
  const labelWidth = 120;
  const barWidth = 360;
  const width = labelWidth + barWidth + 60;
  const height = rowHeight * categories.length + 8;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Findings by category"
    >
      {categories.map((c, i) => {
        const w = (c.count / max) * barWidth;
        const y = i * rowHeight + 4;
        return (
          <g key={c.label}>
            <text
              x={0}
              y={y + 14}
              fontSize={11}
              fill="#a1a1aa"
              fontFamily="ui-sans-serif, system-ui"
            >
              {c.label}
            </text>
            <rect
              x={labelWidth}
              y={y + 4}
              width={barWidth}
              height={rowHeight - 10}
              fill="#27272a"
              rx={3}
            />
            <rect
              x={labelWidth}
              y={y + 4}
              width={w}
              height={rowHeight - 10}
              fill={c.color}
              rx={3}
            />
            <text
              x={labelWidth + barWidth + 8}
              y={y + 14}
              fontSize={11}
              fill="#e4e4e7"
              fontWeight={600}
            >
              {c.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
