import { TH } from "@/lib/i18n/th";

const BAR_HEIGHTS = ["h-16", "h-24", "h-20", "h-28", "h-16", "h-24"];

/** Placeholder cards with the shape of a dashboard widget, shown while the layout and its queries resolve. */
export function WidgetSkeletons({ count }: { count: number }) {
  return (
    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label={TH.common.loading}>
      {Array.from({ length: count }, (unused, index) => (
        <div key={index} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          <div className={`${BAR_HEIGHTS[index % BAR_HEIGHTS.length]} animate-pulse rounded-xl bg-muted`} />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
