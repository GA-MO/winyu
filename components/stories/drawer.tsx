"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Investigation, Story } from "@/lib/contracts";
import { formatThaiDate } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";
import { LeadStory, STORY_ASK, SteadyList, countsLine, orderStories, storyCounts } from "@/components/dashboard/story-board";

const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-xl flex-col border-l border-border bg-background shadow-panel animate-panel-in";
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function StoriesDrawer({
  investigation,
  asOf,
  open,
  onClose,
}: {
  investigation: Investigation | null;
  asOf: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || !investigation) return null;
  const { lead, others, steady } = orderStories(investigation.stories);
  const counts = storyCounts(investigation.stories);

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.stories.landingLead(countsLine(counts))}>
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold">{countsLine(counts)}</h2>
            <p className="text-xs text-muted-foreground">
              {TH.stories.ranAt(BANGKOK_TIME.format(new Date(investigation.at)), formatThaiDate(asOf))} · {TH.stories.looked(investigation.checkedCount)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          {lead ? <LeadStory story={lead} /> : null}
          {others.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              {others.map((story) => (
                <OtherStory key={story.id} story={story} />
              ))}
            </ul>
          ) : null}
          <SteadyList stories={steady} />
        </div>
      </aside>
    </>
  );
}

function OtherStory({ story }: { story: Story }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug">{story.claim}</span>
        <span className="text-xs text-muted-foreground">
          {TH.stories.kind[story.kind]} · {story.headline.label} {story.headline.value}
        </span>
      </div>
      <Link href={`/c/new?story=${encodeURIComponent(story.id)}`} className={STORY_ASK}>
        {TH.stories.ask}
      </Link>
    </li>
  );
}
