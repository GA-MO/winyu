import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WaitingPill } from "@/components/notifications/waiting-pill";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { TH } from "@/lib/i18n/th";
import { decisionCount } from "@/lib/server/inbox";
import { markHomeRead } from "@/lib/server/notify";
import { readUser } from "@/lib/server/session";
import { receivedShares, sentShares } from "@/lib/server/share/lists";
import { SharedLists } from "./shared-lists";

export const dynamic = "force-dynamic";

const PATH = "/shared";
const COPY = TH.shared;

/** Shared: the cards colleagues sent the person and the cards they sent, one row per card and person with its latest state; opening the page reads its notifications. */
export default async function SharedPage() {
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(PATH)}`);
  const now = new Date();
  const received = receivedShares(viewer, now);
  const sent = sentShares(viewer, now);
  const waiting = decisionCount(viewer.id);
  markHomeRead(viewer.id, "shared");

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{COPY.title}</h1>
          <p className="text-sm text-muted-foreground">{COPY.subtitle}</p>
          <WaitingPill count={waiting} />
        </header>
        <SharedLists received={received} sent={sent} nowIso={now.toISOString()} />
      </div>
    </div>
  );
}
