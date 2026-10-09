import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";
import { DirectionA } from "./direction-a";
import { DirectionB } from "./direction-b";
import { DirectionC } from "./direction-c";
import { inboxOf } from "./payload";
import { foldAlerts, handoffRowOf, todoRowOf, type Specimens } from "./rows";
import { ThemeScope } from "./theme-scope";

export const dynamic = "force-dynamic";

const CEO = "u_thana";
const REP = "u_krit";
const DIRECTIONS = [
  { id: "a", Draw: DirectionA },
  { id: "b", Draw: DirectionB },
  { id: "c", Draw: DirectionC },
] as const;

type SearchParams = Promise<{ theme?: string }>;

async function specimensOf(): Promise<Specimens | null> {
  const [ceo, rep] = await Promise.all([inboxOf(CEO), inboxOf(REP)]);
  if (!ceo || !rep) return null;
  const handoff = rep.handoffs[0] ?? null;
  const alerts = foldAlerts(ceo.alerts);
  return {
    ceo: findUser(CEO)?.nameTh ?? CEO,
    rep: findUser(REP)?.nameTh ?? REP,
    todo: ceo.todo.map(todoRowOf),
    alerts,
    alertCount: ceo.alerts.length,
    opened: alerts.urgent[0] ?? null,
    handoff: handoff ? handoffRowOf(handoff, rep.alerts) : null,
    accepted: handoff ? handoffRowOf(handoff, rep.alerts, "accepted") : null,
  };
}

/** Development only: three row designs for the Inbox drawer side by side, each drawing the same real inbox rows of the CEO and a sales rep. */
export default async function DevInboxRowsPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = readUser(await cookies());
  if (!user) redirect("/login?next=/dev/inbox-rows");
  const specimens = await specimensOf();
  const { theme } = await searchParams;
  const header = (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{TH.inboxRows.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{TH.inboxRows.subtitle(findUser(CEO)?.nameTh ?? CEO, findUser(REP)?.nameTh ?? REP)}</p>
    </>
  );

  return (
    <ThemeScope initial={theme === "dark" ? "dark" : "light"} header={header}>
      {specimens ? (
        <main className="mx-auto grid max-w-[84rem] grid-cols-1 justify-center gap-8 px-4 pb-16 sm:px-6 xl:grid-cols-[repeat(3,26rem)]">
          {DIRECTIONS.map(({ id, Draw }) => (
            <section key={id} aria-labelledby={`direction-${id}`} className="mx-auto flex w-full max-w-[26rem] flex-col gap-5">
              <header className="flex flex-col gap-0.5 border-b border-border pb-3">
                <h2 id={`direction-${id}`} className="font-display text-lg font-semibold tracking-tight">
                  {TH.inboxRows.directions[id].name}
                </h2>
                <p className="text-sm text-muted-foreground">{TH.inboxRows.directions[id].idea}</p>
              </header>
              <Draw specimens={specimens} />
            </section>
          ))}
        </main>
      ) : (
        <p className="px-6 text-sm text-muted-foreground">{TH.inboxRows.noData}</p>
      )}
    </ThemeScope>
  );
}
