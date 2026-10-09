import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";
import { Compare } from "./compare";
import { scaleFixture } from "./fixture";
import { collapseRepeats } from "./model";
import { NewShared } from "./new-shared";
import { TodayShared } from "./today";

export const dynamic = "force-dynamic";

const PATH = "/dev/shared-scale";

/** Development only: today's Shared and the proposed one side by side over one large fixture, to judge how each reads with many shares. */
export default async function SharedScalePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(PATH)}`);
  const now = new Date();
  const fixture = scaleFixture(viewer.id, now);
  const { today } = fixture;
  const todayRows = today.activity.length + today.received.length + today.sent.length;
  const nextRows = collapseRepeats(fixture.received).length + collapseRepeats(fixture.sent).length;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <main className="relative mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-12 sm:px-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{TH.sharedScale.title}</h1>
          <p className="text-sm text-muted-foreground">{TH.sharedScale.intro(fixture.viewer.name, fixture.received.length, fixture.sent.length)}</p>
        </header>
        <Compare todayRows={todayRows} nextRows={nextRows} today={<TodayShared today={today} />} next={<NewShared received={fixture.received} sent={fixture.sent} nowIso={now.toISOString()} />} />
      </main>
    </div>
  );
}
