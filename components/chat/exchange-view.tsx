"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, CircleSlash, MousePointerClick, ShieldCheck } from "lucide-react";
import { renderApproval } from "@/components/cards/approval-card";
import { ShareChrome } from "@/components/share/share-sheet";
import { describeToolCall } from "@/lib/cards/describe-call";
import { TOOL_CARDS, type ToolCard } from "@/components/cards/registry";
import { maskPersonalData } from "@/lib/harness/guard";
import { sharedComposedCard, sharedToolCard, type ExchangeRead, type ScreenCards, type ShareTarget } from "@/lib/share/card";
import { TH } from "@/lib/i18n/th";
import { ActionTrail } from "./action-trail";
import { ComposedCardView } from "./composed-card";
import { Markdown } from "./markdown";
import type { Exchange, Question, ReplyStep, ToolStep } from "./timeline";
import { cardPlanOf, composedCalls, isRefused, pairedResultsOf, toolViewOf, wroteBlock, type CardPlan } from "./tool-view";
import { withRequestedCourses } from "./requested-courses";
import { trailOf } from "./trail";
import { pressedText } from "./pressed";
import type { PendingApproval } from "./use-chat-session";

const CARDS: Record<string, ToolCard> = TOOL_CARDS;
const CARD_TOOLS: ReadonlySet<string> = new Set(Object.keys(CARDS));
/** What one exchange needs from the live chat: whether it is the newest, whether a reply streams, the approvals asked and answered, how it ended, the course seats the conversation has requested since, the cards on screen when a send was asked here (the ones a send_card call names), the Thai tool labels its trail names connector calls by, and how long its runs took when this tab saw them. */
export type ExchangeLive = {
  isLast: boolean;
  running: boolean;
  asked: readonly PendingApproval[];
  waiting: ReadonlySet<string>;
  decisions: Readonly<Record<string, boolean>>;
  left: ReadonlySet<string>;
  decide: (toolCallId: string, approved: boolean) => void;
  stopped: boolean;
  error: string | null;
  requestedCourses: ReadonlySet<string>;
  onScreen: ScreenCards | null;
  toolLabels: Readonly<Record<string, string>>;
  durationMs: number | null;
};

function UserBubble({ question }: { question: Question }) {
  if (question.kind === "pressed") {
    const description = describeToolCall(question.tool, question.input);
    return (
      <div className="flex justify-end">
        <p className="inline-flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          <MousePointerClick className="size-4 shrink-0 opacity-70" aria-hidden />
          {description?.title ?? `${TH.conversation.pressed} ${question.tool}`}
        </p>
      </div>
    );
  }
  const masked = maskPersonalData(question.text);
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground">{masked.text}</p>
      {masked.kinds.length > 0 ? (
        <p className="inline-flex max-w-[85%] items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
          {TH.guard.typedNotice(masked.kinds.map((kind) => TH.guard.kind[kind] ?? kind).join(" และ "))}
        </p>
      ) : null}
    </div>
  );
}

function NotDone({ tool, reason, labelTh }: { tool: string; reason: string | null; labelTh: string | undefined }) {
  return (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3" role="status">
      <CircleSlash className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{TH.conversation.notDone(tool, labelTh)}</p>
        {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
      </div>
    </div>
  );
}

function Note({ text, tone }: { text: string; tone: "muted" | "danger" }) {
  const Icon = tone === "danger" ? AlertCircle : CircleSlash;
  return (
    <p className={`flex items-center gap-2 text-sm ${tone === "danger" ? "text-danger" : "text-muted-foreground"}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

/** Keeps one card that throws from taking the whole conversation down; the rest of the reply still reads. */
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <Note text={TH.cards.unreadable} tone="muted" /> : this.props.children;
  }
}

/** What a card in this exchange needs to offer ส่งต่อ: the exchange's read calls and the question it asked; null while the reply streams. */
type Sharing = { calls: ExchangeRead[]; question: string | null } | null;

function toolShare(sharing: Sharing, toolCallId: string, partners: readonly string[]): ShareTarget | null {
  if (!sharing) return null;
  const card = sharedToolCard(sharing.calls, toolCallId, partners);
  return card ? { card, question: sharing.question } : null;
}

function composedShare(sharing: Sharing, step: Extract<ReplyStep, { kind: "composed" }>): ShareTarget | null {
  if (!sharing || !step.surface.done) return null;
  const card = sharedComposedCard(sharing.calls, step.surface);
  return card ? { card, question: sharing.question } : null;
}

function sharingOf(exchange: Exchange, toolSteps: readonly ToolStep[], streaming: boolean): Sharing {
  if (streaming) return null;
  const calls = toolSteps.filter((step) => CARD_TOOLS.has(step.name)).map((step) => ({ toolCallId: step.toolCallId, tool: step.name, args: step.args, returned: step.outcome.state === "returned" }));
  return { calls, question: exchange.question?.kind === "typed" ? exchange.question.text : null };
}

function ToolStepView({ step, steps, live, plan, streaming, sharing, asked }: { step: ToolStep; steps: readonly ToolStep[]; live: ExchangeLive; plan: CardPlan; streaming: boolean; sharing: Sharing; asked: string | null }) {
  const asking = live.waiting.has(step.toolCallId);
  const view = toolViewOf(step, { running: streaming, asking, decided: live.decisions[step.toolCallId], left: live.left.has(step.toolCallId), hidden: plan.hidden.has(step.toolCallId) }, CARD_TOOLS);
  if (view.kind === "card")
    return (
      <div className="flex w-full animate-hero-rise flex-col gap-1">
        <ShareChrome target={isRefused(view.result) ? null : toolShare(sharing, step.toolCallId, plan.paired.get(step.toolCallId) ?? [])}>{CARDS[view.name](view.result, view.args, pairedResultsOf(plan, steps, step.toolCallId))}</ShareChrome>
      </div>
    );
  if (view.kind === "not-run") return <Note text={TH.conversation.notRun} tone="muted" />;
  if (view.kind === "not-done") return <NotDone tool={view.tool} reason={view.reason} labelTh={live.toolLabels[view.tool]} />;
  if (view.kind === "none") return null;
  return (
    <div className="w-full">
      {renderApproval({
        tool: view.tool,
        input: view.input,
        approved: view.approved,
        result: view.result,
        approve: () => live.decide(step.toolCallId, true),
        reject: () => live.decide(step.toolCallId, false),
        onScreen: live.onScreen,
        question: asked,
        labelTh: live.toolLabels[view.tool],
      })}
    </div>
  );
}

function StepView({ step, toolSteps, live, plan, streaming, sharing, asked }: { step: ReplyStep; toolSteps: readonly ToolStep[]; live: ExchangeLive; plan: CardPlan; streaming: boolean; sharing: Sharing; asked: string | null }) {
  if (step.kind === "text") return <Markdown text={step.text} />;
  if (step.kind === "composed")
    return (
      <CardBoundary>
        <div className="flex w-full flex-col gap-1">
          <ShareChrome target={composedShare(sharing, step)}>
            <ComposedCardView surface={withRequestedCourses(step.surface, live.requestedCourses)} />
          </ShareChrome>
        </div>
      </CardBoundary>
    );
  return (
    <CardBoundary>
      <ToolStepView step={step} steps={toolSteps} live={live} plan={plan} streaming={streaming} sharing={sharing} asked={asked} />
    </CardBoundary>
  );
}

function shows(step: ReplyStep): boolean {
  return step.kind !== "tool" || step.outcome.state !== "failed";
}

function Ending({ exchange, live }: { exchange: Exchange; live: ExchangeLive }) {
  if (!live.isLast || live.running) return null;
  if (live.error) return <Note text={live.error} tone="danger" />;
  if (live.stopped) return <Note text={TH.conversation.stopped} tone="muted" />;
  if (live.asked.length > 0 || exchange.steps.some(shows)) return null;
  return <Note text={TH.chat.unanswered} tone="muted" />;
}

/** The reply steps with each approval the stream never showed as a tool call put back where it was asked, so its decision or receipt reads before the sentence that followed it. */
function stepsWithApprovals(exchange: Exchange, asked: readonly PendingApproval[]): ReplyStep[] {
  const seen = new Set(exchange.steps.flatMap((step) => (step.kind === "tool" ? [step.toolCallId] : [])));
  const steps = [...exchange.steps];
  const unseen = asked.filter((approval) => !seen.has(approval.toolCallId)).sort((left, right) => right.position - left.position);
  for (const approval of unseen) {
    const step: ToolStep = { kind: "tool", toolCallId: approval.toolCallId, name: approval.tool, args: approval.input, outcome: { state: "pending" } };
    steps.splice(Math.min(approval.position, steps.length), 0, step);
  }
  return steps;
}

function askedText(question: Question | null): string | null {
  if (!question) return null;
  return question.kind === "typed" ? question.text : pressedText(question);
}

/** One question and its answer: the question bubble, the trail of what the agent did (live while it streams, one quiet line after), then reply sentences, cards and decisions in the order the agent produced them; an approval the stream asked for without showing its call still gets its card. */
export function ExchangeView({ exchange, live }: { exchange: Exchange; live: ExchangeLive }) {
  const streaming = live.running && live.isLast;
  const toolSteps = exchange.steps.filter((step): step is ToolStep => step.kind === "tool");
  const plan = cardPlanOf(toolSteps, composedCalls(exchange.steps, streaming), CARD_TOOLS, wroteBlock(exchange.steps));
  const sharing = sharingOf(exchange, toolSteps, streaming);
  const steps = stepsWithApprovals(exchange, live.asked);
  return (
    <article data-exchange={exchange.id} className="flex flex-col gap-4">
      {exchange.question ? <UserBubble question={exchange.question} /> : null}
      <ActionTrail trail={trailOf(steps, streaming, live.toolLabels)} streaming={streaming} durationMs={live.durationMs} />
      {steps.map((step) => (
        <StepView key={step.kind === "tool" ? step.toolCallId : `${step.kind}-${step.id}`} step={step} toolSteps={toolSteps} live={live} plan={plan} streaming={streaming} sharing={sharing} asked={askedText(exchange.question)} />
      ))}
      <Ending exchange={exchange} live={live} />
    </article>
  );
}
