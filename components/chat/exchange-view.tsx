"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, CircleSlash, MessageSquareReply, MousePointerClick, ShieldCheck } from "lucide-react";
import { renderApproval } from "@/components/cards/approval-card";
import { ShareChrome } from "@/components/share/share-sheet";
import { describeToolCall } from "@/lib/cards/describe-call";
import { TOOL_CARDS, type ReplyText, type ToolCard } from "@/components/cards/registry";
import { Badge } from "@/components/ui/primitives";
import type { ContextPacket, HandoffReplyNote } from "@/lib/contracts";
import { maskPersonalData } from "@/lib/harness/guard";
import { sharedComposedCard, sharedToolCard, shareTitle, type ExchangeRead, type ShareTarget } from "@/lib/share/card";
import { TH } from "@/lib/i18n/th";
import { ActionTrail } from "./action-trail";
import { ComposedCardView } from "./composed-card";
import { Markdown } from "./markdown";
import type { Exchange, Question, ReplyStep, ToolStep } from "./timeline";
import { cardPlanOf, composedCalls, toolViewOf, type CardPlan } from "./tool-view";
import { withRequestedCourses } from "./requested-courses";
import { trailOf } from "./trail";
import type { PendingApproval } from "./use-chat-session";

const CARDS: Record<string, ToolCard> = TOOL_CARDS;
const CARD_TOOLS: ReadonlySet<string> = new Set(Object.keys(CARDS));
const STATUS_TONE: Record<ContextPacket["status"], "neutral" | "success" | "warning" | "danger"> = {
  open: "neutral",
  accepted: "success",
  need_info: "warning",
  returned: "danger",
  resolved: "success",
};

/** What one exchange needs from the live chat: whether it is the newest, whether a reply streams, the approvals asked and answered, how it ended, the course seats the conversation has requested since, the card an earlier exchange left on screen (what "ส่งการ์ดนี้" asked here would send), the Thai tool labels its trail names connector calls by, and how long its runs took when this tab saw them. */
export type ExchangeLive = {
  isLast: boolean;
  running: boolean;
  asked: readonly PendingApproval[];
  waiting: ReadonlySet<string>;
  decisions: Readonly<Record<string, boolean>>;
  decide: (toolCallId: string, approved: boolean) => void;
  stopped: boolean;
  error: string | null;
  requestedCourses: ReadonlySet<string>;
  cardBefore: ShareTarget | null;
  toolLabels: Readonly<Record<string, string>>;
  durationMs: number | null;
};

function UserBubble({ question }: { question: Question }) {
  if (question.kind === "pressed") {
    const description = describeToolCall(question.tool, question.input);
    return (
      <div className="flex justify-end">
        <p className="inline-flex max-w-[85%] items-center gap-2 rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-sm font-medium text-foreground">
          <MousePointerClick className="size-4 shrink-0 opacity-70" aria-hidden />
          {description?.title ?? `${TH.conversation.pressed} ${question.tool}`}
        </p>
      </div>
    );
  }
  const masked = maskPersonalData(question.text);
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-[15px] leading-relaxed text-foreground">{masked.text}</p>
      {masked.kinds.length > 0 ? (
        <p className="inline-flex max-w-[85%] items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden />
          {TH.guard.typedNotice(masked.kinds.map((kind) => TH.guard.kind[kind] ?? kind).join(" และ "))}
        </p>
      ) : null}
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

function isRefusal(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === false;
}

function toolShare(sharing: Sharing, toolCallId: string, result: unknown): ShareTarget | null {
  if (!sharing || isRefusal(result)) return null;
  const card = sharedToolCard(sharing.calls, toolCallId);
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

function drawnStep(step: ToolStep, plan: CardPlan): ToolStep {
  return plan.results.has(step.toolCallId) ? { ...step, outcome: { state: "returned", result: plan.results.get(step.toolCallId) } } : step;
}

function ToolStepView({ step, live, plan, reply, sharing }: { step: ToolStep; live: ExchangeLive; plan: CardPlan; reply: ReplyText; sharing: Sharing }) {
  const asking = live.waiting.has(step.toolCallId);
  const view = toolViewOf(drawnStep(step, plan), { running: reply.streaming, asking, decided: live.decisions[step.toolCallId], hidden: plan.hidden.has(step.toolCallId) }, CARD_TOOLS);
  if (view.kind === "card")
    return (
      <div className="flex w-full animate-hero-rise flex-col gap-1">
        <ShareChrome target={toolShare(sharing, step.toolCallId, view.result)}>{CARDS[view.name](view.result, view.args, reply)}</ShareChrome>
      </div>
    );
  if (view.kind === "not-run") return <Note text={TH.conversation.notRun} tone="muted" />;
  if (view.kind === "none") return null;
  return (
    <div className="w-full">
      {renderApproval({
        tool: view.tool,
        input: view.input,
        approved: view.approved,
        approve: () => live.decide(step.toolCallId, true),
        reject: () => live.decide(step.toolCallId, false),
        shareTitle: live.cardBefore ? shareTitle(live.cardBefore.card) : null,
      })}
    </div>
  );
}

function HandoffReplyView({ note }: { note: HandoffReplyNote }) {
  return (
    <aside className="w-full animate-hero-rise rounded-2xl border border-border bg-card px-4 py-3" aria-label={TH.handoff.replyFrom(note.fromName, note.fromTitle)}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <MessageSquareReply className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium text-foreground">{TH.handoff.replyFrom(note.fromName, note.fromTitle)}</span>
        <Badge props={{ label: TH.inbox.status[note.status], tone: STATUS_TONE[note.status] }} />
      </header>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{note.text}</p>
      <p className="mt-1 text-xs text-muted-foreground">{TH.handoff.replyAbout(note.packetTitle)}</p>
    </aside>
  );
}

function StepView({ step, live, plan, reply, sharing }: { step: ReplyStep; live: ExchangeLive; plan: CardPlan; reply: ReplyText; sharing: Sharing }) {
  if (step.kind === "text") return <Markdown text={step.text} />;
  if (step.kind === "handoff-reply") return <HandoffReplyView note={step.note} />;
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
      <ToolStepView step={step} live={live} plan={plan} reply={reply} sharing={sharing} />
    </CardBoundary>
  );
}

function replyOf(exchange: Exchange, streaming: boolean): ReplyText {
  return { text: exchange.steps.flatMap((step) => (step.kind === "text" ? [step.text] : [])).join("\n"), streaming };
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

/** One question and its answer: the question bubble, the trail of what the agent did (live while it streams, one quiet line after), then reply sentences, cards and decisions in the order the agent produced them; an approval the stream asked for without showing its call still gets its card. */
export function ExchangeView({ exchange, live }: { exchange: Exchange; live: ExchangeLive }) {
  const streaming = live.running && live.isLast;
  const toolSteps = exchange.steps.filter((step): step is ToolStep => step.kind === "tool");
  const plan = cardPlanOf(toolSteps, composedCalls(exchange.steps, streaming), CARD_TOOLS);
  const reply = replyOf(exchange, streaming);
  const sharing = sharingOf(exchange, toolSteps, streaming);
  const steps = stepsWithApprovals(exchange, live.asked);
  return (
    <article className="flex flex-col gap-4">
      {exchange.question ? <UserBubble question={exchange.question} /> : null}
      <ActionTrail trail={trailOf(steps, streaming, live.toolLabels)} streaming={streaming} durationMs={live.durationMs} />
      {steps.map((step) => (
        <StepView key={step.kind === "tool" ? step.toolCallId : `${step.kind}-${step.id}`} step={step} live={live} plan={plan} reply={reply} sharing={sharing} />
      ))}
      <Ending exchange={exchange} live={live} />
    </article>
  );
}
