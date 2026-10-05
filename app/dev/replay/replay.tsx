"use client";

import { CardActionsProvider } from "@/components/cards/card-actions";
import { ShareProvider } from "@/components/share/share-sheet";
import { cardsBeforeEach } from "@/components/chat/card-to-share";
import { ExchangeView } from "@/components/chat/exchange-view";
import { TOOL_CARDS } from "@/components/cards/registry";
import { requestedCoursesOf } from "@/components/chat/requested-courses";
import type { Exchange } from "@/components/chat/timeline";

const NOTHING = () => undefined;

/** Recorded exchanges drawn by the chat's exchange view, finished and idle; buttons do nothing. */
export function Replay({ exchanges }: { exchanges: Exchange[] }) {
  const requestedCourses = requestedCoursesOf(exchanges);
  const cardsBefore = cardsBeforeEach(exchanges, new Set(Object.keys(TOOL_CARDS)));
  return (
    <CardActionsProvider value={{ runAction: NOTHING }}>
      <ShareProvider>
        <div className="flex flex-col gap-8">
          {exchanges.map((exchange, index) => (
            <ExchangeView
              key={exchange.id}
              exchange={exchange}
              live={{ isLast: index === exchanges.length - 1, running: false, asked: [], waiting: new Set(), decisions: {}, decide: NOTHING, stopped: false, error: null, requestedCourses, cardBefore: cardsBefore[index] ?? null }}
            />
          ))}
        </div>
      </ShareProvider>
    </CardActionsProvider>
  );
}
