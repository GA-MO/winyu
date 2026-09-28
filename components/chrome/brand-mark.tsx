const SPARK_POINTS = "9,20 20,47 32,28 44,47 55,13";
const COMPACT_POINTS = "12,22 22,46 32,30 42,46 52,14";
const DOT_APPEARS_AT = 0.85;

/** The Winyu W drawn as one sparkline in currentColor; `compact` drops the tip dot for sizes of 20px and under, `draw` (0–1) reveals the stroke. */
export function BrandMark({ className, compact = false, draw = 1 }: { className?: string; compact?: boolean; draw?: number }) {
  const dotOpacity = Math.min(1, Math.max(0, (draw - DOT_APPEARS_AT) / (1 - DOT_APPEARS_AT)));
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <polyline
        points={compact ? COMPACT_POINTS : SPARK_POINTS}
        fill="none"
        stroke="currentColor"
        strokeWidth={compact ? 8.5 : 7}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={draw < 1 ? 1 : undefined}
        strokeDashoffset={draw < 1 ? 1 - draw : undefined}
        opacity={draw > 0 ? 1 : 0}
      />
      {compact ? null : <circle cx="55" cy="13" r="5" fill="currentColor" opacity={dotOpacity} />}
    </svg>
  );
}
