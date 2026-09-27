import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { StoryBoard, StoryHeader } from "@/components/dashboard/story-board";
import { TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { layoutHistory, refreshSuggestions, staleFor, widgetViews } from "@/lib/server/dashboard";
import { feedFor } from "@/lib/server/feed";
import { latestInvestigation } from "@/lib/server/investigate";
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
  const investigation = latestInvestigation(access.userId);
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-10 pt-16 sm:px-8 sm:pt-10">
        <StoryHeader name={findUser(access.userId)?.nameTh ?? ""} investigation={investigation} asOf={TODAY} />
        {investigation ? <StoryBoard stories={investigation.stories} /> : null}
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
