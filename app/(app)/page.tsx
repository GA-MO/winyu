import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { shortName, timeOfDay } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ambientFor, morningBrief, pinnedViews } from "@/lib/server/dashboard";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { readAccess, readUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const jar = await cookies();
  const user = readUser(jar);
  const access = readAccess(jar);
  if (!user || !access) redirect("/login");

  const greeting = { lead: TH.landing.greeting[timeOfDay()], name: shortName(user.nameTh) };
  const widgets = pinnedViews(access).map((view) => ({ id: view.widget.id, spec: view.spec }));

  return (
    <Landing
      greeting={greeting}
      brief={morningBrief(access)}
      widgets={widgets}
      quickActions={quickActionsFor(access)}
      ambient={ambientFor(access)}
    />
  );
}
