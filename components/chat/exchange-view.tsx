"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, CircleSlash, MessageSquareReply, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";
import { renderApproval } from "@/components/cards/approval-card";
import { describeToolCall } from "@/lib/cards/describe-call";
import { TOOL_CARDS, type ReplyText, type ToolCard } from "@/components/cards/registry";
import { Badge } from "@/components/ui/primitives";
import type { ContextPacket, HandoffReplyNote } from "@/lib/contracts";
import { maskPersonalData } from "@/lib/harness/guard";
import { TH } from "@/lib/i18n/th";
import { ComposedCardView } from "./composed-card";
import { Markdown } from "./markdown";
import type { Exchange, Question, ReplyStep, ToolStep } from "./timeline";
import { composedCalls, toolViewOf } from "./tool-view";
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

/** What one exchange needs from the live chat: whether it is the newest, whether a reply streams, the approvals asked and answered, and how it ended. */
export type ExchangeLive = {
  isLast: boolean;
  running: boolean;
  asked: readonly PendingApproval[];
  waiting: ReadonlySet<string>;
  decisions: Readonly<Record<string, boolean>>;
  decide: (toolCallId: string, approved: boolean) => void;
  stopped: boolean;
  error: string | null;
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

function Working({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Sparkles className="size-4 animate-hero-pulse text-primary" aria-hidden />
      <span className="ui-shimmer bg-linear-to-r from-muted-foreground via-foreground to-muted-foreground bg-size-[200%_100%] bg-clip-text text-transparent">{label}</span>
    </p>
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

function ToolStepView({ step, live, composed, reply }: { step: ToolStep; live: ExchangeLive; composed: boolean; reply: ReplyText }) {
  const asking = live.waiting.has(step.toolCallId);
  const view = toolViewOf(step, { running: reply.streaming, asking, decided: live.decisions[step.toolCallId], composed }, CARD_TOOLS);
  if (view.kind === "card") return <div className="w-full animate-hero-rise">{CARDS[view.name](view.result, view.args, reply)}</div>;
  if (view.kind === "working") return <Working label={TH.conversation.working} />;
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

function StepView({ step, live, composed, reply }: { step: ReplyStep; live: ExchangeLive; composed: ReadonlySet<string>; reply: ReplyText }) {
  if (step.kind === "text") return <Markdown text={step.text} />;
  if (step.kind === "handoff-reply") return <HandoffReplyView note={step.note} />;
  if (step.kind === "composed")
    return (
      <CardBoundary>
        <ComposedCardView surface={step.surface} />
      </CardBoundary>
    );
  return (
    <CardBoundary>
      <ToolStepView step={step} live={live} composed={composed.has(step.toolCallId)} reply={reply} />
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
  if (!live.isLast) return null;
  const last = exchange.steps[exchange.steps.length - 1];
  if (live.running) return !last || (last.kind === "tool" && last.outcome.state === "returned") ? <Working label={TH.chat.thinking} /> : null;
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

/** One question and its answer: the question bubble, then reply sentences, cards and decisions in the order the agent produced them; an approval the stream asked for without showing its call still gets its card. */
export function ExchangeView({ exchange, live }: { exchange: Exchange; live: ExchangeLive }) {
  const streaming = live.running && live.isLast;
  const composed = composedCalls(exchange.steps, streaming);
  const reply = replyOf(exchange, streaming);
  return (
    <article className="flex flex-col gap-4">
      {exchange.question ? <UserBubble question={exchange.question} /> : null}
      {stepsWithApprovals(exchange, live.asked).map((step) => (
        <StepView key={step.kind === "tool" ? step.toolCallId : `${step.kind}-${step.id}`} step={step} live={live} composed={composed} reply={reply} />
      ))}
      <Ending exchange={exchange} live={live} />
    </article>
  );
}
