"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, CircleSlash, MousePointerClick, Sparkles } from "lucide-react";
import { renderApproval } from "@/components/cards/approval-card";
import { describeToolCall } from "@/components/cards/describe-tool";
import { TOOL_CARDS, type ToolCard } from "@/components/cards/registry";
import { TH } from "@/lib/i18n/th";
import { Markdown } from "./markdown";
import type { Exchange, Question, ReplyStep, ToolStep } from "./timeline";
import { toolViewOf } from "./tool-view";
import type { PendingApproval } from "./use-chat-session";

const CARD_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_CARDS));
const CARDS: Record<string, ToolCard> = TOOL_CARDS;

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
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-[15px] leading-relaxed text-foreground">{question.text}</p>
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

function ToolStepView({ step, live }: { step: ToolStep; live: ExchangeLive }) {
  const asking = live.waiting.has(step.toolCallId);
  const view = toolViewOf(step, { running: live.running && live.isLast, asking, decided: live.decisions[step.toolCallId] }, CARD_TOOLS);
  if (view.kind === "card") return <div className="w-full animate-hero-rise">{CARDS[view.name](view.result, view.args)}</div>;
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

function StepView({ step, live }: { step: ReplyStep; live: ExchangeLive }) {
  if (step.kind === "text") return <Markdown text={step.text} />;
  return (
    <CardBoundary>
      <ToolStepView step={step} live={live} />
    </CardBoundary>
  );
}

function shows(step: ReplyStep): boolean {
  return step.kind === "text" || step.outcome.state !== "failed";
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
  return (
    <article className="flex flex-col gap-4">
      {exchange.question ? <UserBubble question={exchange.question} /> : null}
      {stepsWithApprovals(exchange, live.asked).map((step) => (
        <StepView key={step.kind === "text" ? `text-${step.id}` : step.toolCallId} step={step} live={live} />
      ))}
      <Ending exchange={exchange} live={live} />
    </article>
  );
}
