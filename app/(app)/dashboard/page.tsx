import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { TH } from "@/lib/i18n/th";
import { widgetViews } from "@/lib/server/dashboard";
import { readAccess } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const views = widgetViews(access);
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            <GradientText>{TH.dash.title}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">{TH.dash.placeholderNote}</p>
        </header>
        <DashboardView pinned={views.filter((view) => view.widget.pinned)} suggested={views.filter((view) => !view.widget.pinned)} />
      </div>
    </div>
  );
}
