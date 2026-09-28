import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { shortName, timeOfDay } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { TODAY } from "@/lib/data/dates";
import { landingKpis } from "@/lib/server/dashboard";
import { morningBriefFor } from "@/lib/server/morning-brief";
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
  const kpis = await landingKpis(access);
  markVisit(access);
  const greeting = { lead: TH.landing.greeting[timeOfDay()], name: shortName(user.nameTh) };
  return (
    <Landing
      greeting={greeting}
      kpis={kpis}
      quickActions={quickActionsFor(access)}
      brief={await morningBriefFor(access)}
      asOf={TODAY}
      draft={draft ?? ""}
      placeholder={TH.landing.composerPlaceholderFor(access.role)}
    />
  );
}
