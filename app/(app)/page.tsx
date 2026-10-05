import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { TODAY } from "@/lib/data/dates";
import { shortName, timeOfDay } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { landingKpis } from "@/lib/server/dashboard";
import { landingFeedFor } from "@/lib/server/feed";
import { morningBriefFor } from "@/lib/server/morning-brief";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { readAccess, readUser } from "@/lib/server/session";
import { markVisit } from "@/lib/server/visits";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const jar = await cookies();
  const user = readUser(jar);
  const access = readAccess(jar);
  if (!user || !access) redirect("/login");

  const [kpis, feed, brief] = await Promise.all([landingKpis(access), landingFeedFor(access), morningBriefFor(access)]);
  markVisit(access, feed.shownKeys);
  return (
    <Landing
      greeting={{ lead: TH.landing.greeting[timeOfDay()], name: shortName(user.nameTh) }}
      kpis={kpis}
      quickActions={quickActionsFor(access)}
      brief={brief}
      asOf={TODAY}
      matters={{ cards: feed.cards, taskCount: feed.taskCount }}
      placeholder={TH.landing.composerPlaceholderFor(access.role)}
    />
  );
}
