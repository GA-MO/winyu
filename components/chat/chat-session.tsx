"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Sparkles } from "lucide-react";
import type { QuickAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { isFollowUpIntent } from "@/lib/engine/follow-ups";
import { CardActionsProvider } from "@/components/cards/card-actions";
import { TOOL_CARDS } from "@/components/cards/registry";
import { ShareProvider } from "@/components/share/share-sheet";
import { Composer } from "@/components/composer/composer";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { cardsBeforeEach } from "./card-to-share";
import { ExchangeView, type ExchangeLive } from "./exchange-view";
import { answeredMetrics, chipRow, latestFollowUps } from "./follow-ups";
import { requestedCoursesOf } from "./requested-courses";
import { useChatSession, type AgentMessage, type PendingApproval } from "./use-chat-session";

const COLUMN = "mx-auto w-full max-w-3xl px-4 sm:px-6";
const CARD_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_CARDS));
const EMPTY_CHIPS = 4;
const ANSWER_CHIPS = 3;
const PINNED_SLACK_PX = 120;
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const CHIP =
  "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground shadow-card transition hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The window event the chat fires when a reply ends, so the thread rail can pick up a new or retitled thread. */
export const THREADS_CHANGED = "winyu:threads-changed";

/** A handoff packet this thread was opened from, and who sent it. */
export type SessionPreload = { packetId: string; fromName: string };

export type ChatSessionProps = {
  threadId: string;
  initialPrompt: string | null;
  initialMessages: AgentMessage[];
  initialApprovals: PendingApproval[];
  preload: SessionPreload | null;
  suggestions: QuickAction[];
  placeholder: string;
};

function notePressed(action: QuickAction): void {
  const kind = isFollowUpIntent(action.intentKey) ? "follow_up" : "quick_action";
  void fetch(QUICK_ACTIONS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intentKey: action.intentKey, prompt: action.prompt, kind }),
  }).catch(() => undefined);
}

function useStickToBottom() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const node = scroller.current;
    const inner = content.current;
    if (!node || !inner) return;
    const follow = new ResizeObserver(() => {
      if (pinned.current) node.scrollTo({ top: node.scrollHeight });
    });
    follow.observe(inner);
    return () => follow.disconnect();
  }, []);
  const onScroll = () => {
    const node = scroller.current;
    if (node) pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < PINNED_SLACK_PX;
  };
  return { scroller, content, onScroll };
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center animate-hero-rise">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-card">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <p className="text-base font-medium">{TH.chat.emptyTitle}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{TH.chat.emptyDescription}</p>
    </div>
  );
}

function PreloadBanner({ preload }: { preload: SessionPreload }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card animate-hero-rise">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink text-ink-foreground">
        <Inbox className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{TH.session.preloadBanner(preload.fromName)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{TH.session.preloadOpen}</p>
      </div>
    </div>
  );
}

/** The chat column for one thread: the transcript with its cards and decisions, follow-up chips, and the composer docked at the bottom. */
export function ChatSession({ threadId, initialPrompt, initialMessages, initialApprovals, preload, suggestions, placeholder }: ChatSessionProps) {
  const session = useChatSession({ threadId, initialMessages, initialApprovals, preloadPacketId: preload?.packetId ?? null });
  const { exchanges, running, ready, send } = session;
  const [text, setText] = useState("");
  const sentInitial = useRef(false);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!ready || sentInitial.current || !initialPrompt) return;
    sentInitial.current = true;
    send(initialPrompt);
    window.history.replaceState(null, "", `/c/${threadId}`);
  }, [initialPrompt, ready, send, threadId]);

  useEffect(() => {
    if (wasRunning.current && !running) window.dispatchEvent(new Event(THREADS_CHANGED));
    wasRunning.current = running;
  }, [running]);

  const { scroller, content, onScroll } = useStickToBottom();

  const chips = useMemo(() => {
    if (!ready || running || session.waiting.size > 0) return [];
    if (exchanges.length === 0) return suggestions.slice(0, EMPTY_CHIPS);
    return chipRow(latestFollowUps(exchanges), suggestions, ANSWER_CHIPS, answeredMetrics(exchanges));
  }, [exchanges, ready, running, session.waiting.size, suggestions]);

  const submit = (value: string) => {
    setText("");
    send(value);
  };

  const requestedCourses = useMemo(() => requestedCoursesOf(exchanges), [exchanges]);
  const cardsBefore = useMemo(() => cardsBeforeEach(exchanges, CARD_TOOLS), [exchanges]);

  const live = (index: number): ExchangeLive => {
    const isLast = index === exchanges.length - 1;
    return {
      isLast,
      running,
      asked: session.asked.filter((approval) => approval.exchangeId === exchanges[index].id),
      waiting: session.waiting,
      decisions: session.decisions,
      decide: session.decide,
      stopped: isLast && session.stoppedExchangeId === exchanges[index].id,
      error: isLast ? session.error : null,
      requestedCourses,
      cardBefore: cardsBefore[index] ?? null,
    };
  };

  return (
    <CardActionsProvider value={{ runAction: session.runAction }}>
      <ShareProvider>
        <div className="relative flex h-full min-h-0 flex-1 flex-col">
          <GlowBackdrop className="opacity-60" />
          <div ref={scroller} onScroll={onScroll} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
            <div ref={content} className={`flex flex-col gap-8 pb-8 pt-16 ${COLUMN}`}>
              {preload ? <PreloadBanner preload={preload} /> : null}
              {exchanges.length === 0 && !running && !initialPrompt ? <EmptyState /> : null}
              {exchanges.map((exchange, index) => (
                <ExchangeView key={exchange.id} exchange={exchange} live={live(index)} />
              ))}
              {exchanges.length === 0 && session.error ? <p className="text-sm text-danger" role="alert">{session.error}</p> : null}
            </div>
          </div>
          <div className="relative z-10 shrink-0 border-t border-border bg-background/90 pb-4 pt-3 backdrop-blur">
            <div className={`flex flex-col gap-3 ${COLUMN}`}>
              {chips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {chips.map((action) => (
                    <button key={action.id} type="button" title={action.reason} onClick={() => {
                        notePressed(action);
                        send(action.prompt);
                      }} className={CHIP}>
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <Composer value={text} onValueChange={setText} onSubmit={submit} size="docked" busy={running || !ready} onStop={running ? session.stop : undefined} placeholder={placeholder} />
            </div>
          </div>
        </div>
      </ShareProvider>
    </CardActionsProvider>
  );
}
