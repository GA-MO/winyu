import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { TH } from "@/lib/i18n/th";
import { layoutHistory, refreshSuggestions, staleFor, widgetViews } from "@/lib/server/dashboard";
import { feedFor } from "@/lib/server/feed";
import { readAccess } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  await refreshSuggestions(access);
  const views = await widgetViews(access, await feedFor(access));
  const stale = new Set(staleFor(access).map((widget) => widget.id));
  const history = layoutHistory(access);
  const restorable = history.find((entry) => entry.savedAt.slice(0, 10) < new Date().toISOString().slice(0, 10)) ?? null;
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.75rem]">
            <GradientText>{TH.dashboard.title}</GradientText>
          </h1>
        </header>
        <DashboardView
          pinned={views.filter((view) => view.widget.pinned)}
          stale={views.filter((view) => stale.has(view.widget.id)).map((view) => view.widget)}
          learned={views.filter((view) => !view.widget.pinned && view.widget.source === "ai_suggested")}
          suggested={views.filter((view) => !view.widget.pinned && view.widget.source !== "ai_suggested")}
          restorable={restorable ? { version: restorable.version, savedAt: restorable.savedAt } : null}
        />
      </div>
    </div>
  );
}
