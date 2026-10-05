import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { WidgetSkeletons } from "@/components/dashboard/widget-skeleton";

export default function DashboardLoading() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-muted" />
        <WidgetSkeletons count={6} />
      </div>
    </div>
  );
}
