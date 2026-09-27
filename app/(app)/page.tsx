import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { shortName, timeOfDay } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { landingKpis } from "@/lib/server/dashboard";
import { landingFeedFor } from "@/lib/server/feed";
import { latestInvestigation } from "@/lib/server/investigate";
import { orderStories, storyCounts } from "@/components/dashboard/story-board";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { readAccess, readUser } from "@/lib/server/session";
import { markVisit } from "@/lib/server/visits";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ draft?: string }> };

export default async function LandingPage({ searchParams }: PageProps) {
  const jar = await cookies();
  const user = readUser(jar);
  const access = readAccess(jar);
  if (!user || !access) redirect("/login");

  const { draft } = await searchParams;
  const [kpis, feed] = await Promise.all([landingKpis(access), landingFeedFor(access)]);
  markVisit(access, feed.shownKeys);
  const greeting = { lead: TH.landing.greeting[timeOfDay()], name: shortName(user.nameTh) };
  const stories = latestInvestigation(access.userId)?.stories ?? [];
  const lead = orderStories(stories).lead;

  return (
    <Landing
      greeting={greeting}
      kpis={kpis}
      taskCount={feed.taskCount}
      quickActions={quickActionsFor(access)}
      ambient={feed.cards}
      story={lead ? { story: lead, counts: storyCounts(stories) } : null}
      draft={draft ?? ""}
      placeholder={TH.landing.composerPlaceholderFor(access.role)}
    />
  );
}
