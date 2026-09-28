"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { MorningBrief } from "@/lib/contracts";
import { formatThaiDate } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";
import { SteadyList, StoryItem, countsLine, orderCards, storyCounts } from "@/components/stories/story-list";

const PANEL = "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-xl flex-col border-l border-border bg-background shadow-panel animate-panel-in";
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function StoriesDrawer({ brief, asOf, open, onClose }: { brief: MorningBrief | null; asOf: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || !brief) return null;
  const { ranked, steady } = orderCards(brief.cards);
  const counts = countsLine(storyCounts(brief.cards.map((card) => card.story)));

  return (
    <>
      <button type="button" aria-label={TH.common.close} onClick={onClose} className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm" />
      <aside className={PANEL} aria-label={TH.stories.landingLead(counts)}>
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold">{counts}</h2>
            <p className="text-xs text-muted-foreground">
              {TH.stories.ranAt(BANGKOK_TIME.format(new Date(brief.at)), formatThaiDate(asOf))} · {TH.stories.looked(brief.checkedCount)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={TH.common.close} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          {ranked.length > 0 ? (
            <div className="flex flex-col">
              {ranked.map((card, index) => (
                <StoryItem key={card.story.id} card={card} defaultOpen={index === 0} />
              ))}
            </div>
          ) : null}
          <SteadyList cards={steady} />
        </div>
      </aside>
    </>
  );
}
