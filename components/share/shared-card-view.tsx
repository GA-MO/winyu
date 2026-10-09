"use client";

import { useRouter } from "next/navigation";
import { CircleSlash } from "lucide-react";
import { actionRequest } from "@/components/cards/action-tool";
import { CardActionsProvider, type CardAction } from "@/components/cards/card-actions";
import { DataCard } from "@/components/cards/data-card";
import { TOOL_CARDS, type ToolCard } from "@/components/cards/registry";
import { ComposedCardView } from "@/components/chat/composed-card";
import { pressParam } from "@/components/chat/pressed";
import type { ToolStep } from "@/components/chat/timeline";
import { cardPlanOf, toolViewOf } from "@/components/chat/tool-view";
import type { LockedRows } from "@/lib/cards/present";
import { metricTitle } from "@/lib/cards/tool-answers";
import type { ComposedSurface } from "@/lib/compose/catalog";
import { TH } from "@/lib/i18n/th";

const CARDS: Record<string, ToolCard> = TOOL_CARDS;
const CARD_TOOLS: ReadonlySet<string> = new Set(Object.keys(CARDS));
const NOTHING_RUNNING = { running: false, asking: false, decided: undefined } as const;
const NO_REPLY = { text: "", streaming: false };
const LOCKABLE_TOOL = "query_metric";

/** A stored read as it came back for the viewer; JSON-safe so it crosses from the share page. */
export type FreshReadView = { toolCallId: string; tool: string; input: Record<string, unknown>; result: unknown; locked: LockedRows | null };

function stepOf(read: FreshReadView): ToolStep {
  return { kind: "tool", toolCallId: read.toolCallId, name: read.tool, args: read.input, outcome: { state: "returned", result: read.result } };
}

function chatHref(action: CardAction): string | null {
  const request = actionRequest(action);
  if (!request) return null;
  if (request.kind === "ask") return `/c/new?prompt=${encodeURIComponent(request.prompt)}`;
  return `/c/new?press=${encodeURIComponent(pressParam({ tool: request.tool, input: request.input, label: request.label }))}`;
}

function cardOf(name: string, result: unknown, args: unknown, locked: LockedRows | null) {
  if (locked && name === LOCKABLE_TOOL) return <DataCard title={metricTitle(result, args)} source={result} locked={locked} />;
  return CARDS[name](result, args, NO_REPLY);
}

function FixedCards({ reads }: { reads: readonly FreshReadView[] }) {
  const steps = reads.map(stepOf);
  const plan = cardPlanOf(steps, new Set(), CARD_TOOLS);
  const drawn = reads.flatMap((read, index) => {
    const step = steps[index];
    const result = plan.results.has(step.toolCallId) ? plan.results.get(step.toolCallId) : undefined;
    const view = toolViewOf(result === undefined ? step : { ...step, outcome: { state: "returned", result } }, { ...NOTHING_RUNNING, hidden: plan.hidden.has(step.toolCallId) }, CARD_TOOLS);
    return view.kind === "card" ? [<div key={step.toolCallId}>{cardOf(view.name, view.result, view.args, read.locked)}</div>] : [];
  });
  if (drawn.length > 0) return <>{drawn}</>;
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <CircleSlash className="size-4 shrink-0" aria-hidden />
      {TH.share.empty}
    </p>
  );
}

/** A shared card drawn for the person opening it, from their own fresh results: the re-grounded composed card when any of it holds for them, else the fixed cards; a card button continues in a new chat. */
export function SharedCardView({ reads, surface }: { reads: FreshReadView[]; surface: ComposedSurface | null }) {
  const router = useRouter();
  const runAction = (action: CardAction) => {
    const href = chatHref(action);
    if (href) router.push(href);
  };
  return (
    <CardActionsProvider value={{ runAction }}>
      <div className="flex w-full flex-col gap-4">{surface ? <ComposedCardView surface={surface} /> : <FixedCards reads={reads} />}</div>
    </CardActionsProvider>
  );
}
