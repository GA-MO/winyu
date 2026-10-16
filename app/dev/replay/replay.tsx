"use client";

import { useState } from "react";
import { CardActionsProvider } from "@/components/cards/card-actions";
import { ShareProvider } from "@/components/share/share-sheet";
import { cardsToSendEach } from "@/components/chat/card-to-share";
import { ExchangeView } from "@/components/chat/exchange-view";
import { TOOL_CARDS } from "@/components/cards/registry";
import { requestedCoursesOf } from "@/components/chat/requested-courses";
import type { Exchange } from "@/components/chat/timeline";
import { useFollowLatest } from "@/components/chat/follow-latest";

const NOTHING = () => undefined;

/** Recorded exchanges drawn by the chat's exchange view, the last one streaming when `streaming`; buttons do nothing. */
export function Replay({ exchanges, streaming, toolLabels, durationMs }: { exchanges: Exchange[]; streaming: boolean; toolLabels: Record<string, string>; durationMs: number | null }) {
  const requestedCourses = requestedCoursesOf(exchanges);
  const cardsToSend = cardsToSendEach(exchanges, new Set(Object.keys(TOOL_CARDS)));
  return (
    <CardActionsProvider value={{ runAction: NOTHING }}>
      <ShareProvider open>
        <div className="flex flex-col gap-8">
          {exchanges.map((exchange, index) => (
            <ExchangeView
              key={exchange.id}
              exchange={exchange}
              live={{ isLast: index === exchanges.length - 1, running: streaming, asked: [], waiting: new Set(), decisions: {}, decide: NOTHING, stopped: false, error: null, requestedCourses, cardToSend: cardsToSend[index] ?? null, toolLabels, durationMs }}
            />
          ))}
        </div>
      </ShareProvider>
    </CardActionsProvider>
  );
}

/** The recorded exchanges arriving one at a time in a scroll container that follows the newest one as the chat does; `data-replay-next` adds the next. */
export function FollowReplay({ exchanges, toolLabels }: { exchanges: Exchange[]; toolLabels: Record<string, string> }) {
  const [count, setCount] = useState(1);
  const shown = exchanges.slice(0, count);
  const { scroller, content, onScroll } = useFollowLatest(shown[shown.length - 1]?.id ?? null);
  return (
    <div className="flex h-page flex-col">
      <div ref={scroller} onScroll={onScroll} data-replay-scroller className="min-h-0 flex-1 overflow-y-auto">
        <div ref={content} className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6">
          <Replay exchanges={shown} streaming={false} toolLabels={toolLabels} durationMs={null} />
        </div>
      </div>
      <button type="button" data-replay-next disabled={count >= exchanges.length} onClick={() => setCount(count + 1)} className="shrink-0 border-t border-border bg-card py-3 text-sm disabled:opacity-40">
        {count} / {exchanges.length}
      </button>
    </div>
  );
}
