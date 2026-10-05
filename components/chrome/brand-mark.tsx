const SPARK_POINTS = "9,20 20,47 32,28 44,47 55,13";

/** mascop's mark: one sparkline in currentColor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <polyline points={SPARK_POINTS} fill="none" stroke="currentColor" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="55" cy="13" r="5.5" fill="currentColor" />
    </svg>
  );
}
