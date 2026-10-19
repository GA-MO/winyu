"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UseAgentUpdate, useAgent, useCopilotKit, type Interrupt, type ResumeEntry } from "@copilotkit/react-core/v2";
import { actionRequest } from "@/components/cards/action-tool";
import type { CardAction } from "@/components/cards/card-actions";
import { CHAT_AGENT_ID } from "@/components/providers/copilot-provider";
import { TH } from "@/lib/i18n/th";
import { pressedText } from "./pressed";
import { exchangesOf, progressOf, type Exchange } from "./timeline";

const UPDATES = [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged];
const THROTTLE_MS = 50;
const SIGNED_OUT = /\b401\b/;
const SPENT = /\b409\b/;
const TIMED_OUT = /timed out/i;
/** A chat step sends its first content within 12 s and rarely runs past 30 s, so 20 s with nothing new on screen is worth a word. */
const SLOW_AFTER_MS = 20_000;

/** A write tool call the agent paused for the person: the interrupt the answer must quote, the call it pauses, what it would do, the exchange that asked, and how many reply steps came before it. */
export type PendingApproval = { interruptId: string; toolCallId: string; tool: string; input: unknown; exchangeId: string | null; position: number };

/** Everything the chat column draws and can do for one thread. */
export type ChatSession = {
  ready: boolean;
  exchanges: Exchange[];
  running: boolean;
  asked: PendingApproval[];
  waiting: ReadonlySet<string>;
  decisions: Readonly<Record<string, boolean>>;
  left: ReadonlySet<string>;
  error: string | null;
  slow: boolean;
  retry: (() => void) | null;
  stoppedExchangeId: string | null;
  durations: Readonly<Record<string, number>>;
  send: (text: string) => void;
  runAction: (action: CardAction) => void;
  decide: (toolCallId: string, approved: boolean) => void;
  stop: () => void;
};

/** A message as the runtime's agent holds it; the server restores a thread in this shape. */
export type AgentMessage = ReturnType<typeof useAgent>["agent"]["messages"][number];

type MastraInterruptMetadata = { mastra?: { toolName?: unknown; args?: unknown } };

function approvalOf(interrupt: Interrupt, exchangeId: string | null, position: number): PendingApproval | null {
  if (!interrupt.toolCallId) return null;
  const mastra = (interrupt.metadata as MastraInterruptMetadata | undefined)?.mastra;
  return { interruptId: interrupt.id, toolCallId: interrupt.toolCallId, tool: typeof mastra?.toolName === "string" ? mastra.toolName : "", input: mastra?.args ?? {}, exchangeId, position };
}

function lastQuestionId(messages: readonly AgentMessage[]): string | null {
  return messages.findLast((message) => message.role === "user")?.id ?? null;
}

/** Why the last run ended without an answer, in the person's words, and whether asking the same question again could help: not when they are signed out or answered an approval twice. */
export type Failure = { text: string; retryable: boolean };

export function failureOf(error: unknown): Failure {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (SIGNED_OUT.test(text)) return { text: TH.conversation.signedOut, retryable: false };
  if (SPENT.test(text)) return { text: TH.harness.approvalSpent, retryable: false };
  if (TIMED_OUT.test(text)) return { text: TH.conversation.timedOut, retryable: true };
  return { text: TH.conversation.failed, retryable: true };
}

/** The transcript to ask again from: everything up to and including the last question, so what a failed run left on screen goes and the question is sent again under its own id, which memory already holds once. */
export function askedAgain<Message extends { role: string }>(messages: readonly Message[]): Message[] | null {
  const last = messages.findLastIndex((message) => message.role === "user");
  return last < 0 ? null : messages.slice(0, last + 1);
}

/** Whether a running reply has shown nothing new for SLOW_AFTER_MS. */
function useSlow(running: boolean, progress: string): boolean {
  const [slowOn, setSlowOn] = useState<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setSlowOn(progress), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [running, progress]);
  return running && slowOn === progress;
}

function newId(): string {
  return crypto.randomUUID();
}

/** An approval interrupt nobody answered yet, and the tool call it pauses when known. */
export type Unanswered = { interruptId: string; toolCallId: string | null };

/** The approvals a new question declines: those of the last asking reply the person has not decided, and any interrupt the agent still holds, since a run that leaves one unaddressed is refused before it starts. */
export function unansweredOf(batch: readonly PendingApproval[], decisions: Readonly<Record<string, boolean>>, held: readonly Interrupt[]): Unanswered[] {
  const asked = batch.filter((approval) => !(approval.toolCallId in decisions)).map((approval) => ({ interruptId: approval.interruptId, toolCallId: approval.toolCallId }));
  const known = new Set(asked.map((entry) => entry.interruptId));
  const stillHeld = held.filter((interrupt) => !known.has(interrupt.id)).map((interrupt) => ({ interruptId: interrupt.id, toolCallId: interrupt.toolCallId ?? null }));
  return [...asked, ...stillHeld];
}

/** The turn times after a run ends: a run that only carries out the person's answer to an approval adds nothing, so the exchange keeps the time of the run that asked. */
export function durationsAfter(current: Readonly<Record<string, number>>, exchangeId: string, took: number, answerOnly: boolean): Record<string, number> {
  if (answerOnly) return { ...current };
  return { ...current, [exchangeId]: (current[exchangeId] ?? 0) + took };
}

function declined(entry: Unanswered): ResumeEntry {
  return { interruptId: entry.interruptId, status: "resolved", payload: { approved: false } };
}

/** A run still replying when the page was opened, and when it started (epoch ms). */
export type LiveRun = { id: string; startedAt: number };

/** When a run the chat sees start began: the run the page joined after a reload started before the page did, so its turn is timed from its own start; any other run starts now. */
export function runStartedAt(runId: string, live: LiveRun | null, now: number): number {
  return live && live.id === runId ? live.startedAt : now;
}

/** What the page restored for one thread: the saved transcript, the approvals still open, and the run still replying when the page was opened (null when none). */
export type RestoredThread = { threadId: string; initialMessages: readonly AgentMessage[]; initialApprovals: readonly PendingApproval[]; liveRun: LiveRun | null };

/** One thread's chat over the CopilotKit runtime: restores the saved transcript and joins a reply still running (a page reloaded mid-reply shows the question, the working state and the reply as it lands), sends questions and pressed buttons, answers approval interrupts (a question sent while one waits declines it, so the card reads not done and the new question runs), says when a reply shows nothing new for a while, asks the last question again after a failed run (the runtime supersedes any run of the thread still going, so two never run at once), and stops a reply. */
export function useChatSession({ threadId, initialMessages, initialApprovals, liveRun }: RestoredThread): ChatSession {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({ agentId: `${CHAT_AGENT_ID}:${threadId}`, runtimeAgentId: CHAT_AGENT_ID, threadId, updates: UPDATES, throttleMs: THROTTLE_MS });
  const [restored, setRestored] = useState(false);
  const [asked, setAsked] = useState<PendingApproval[]>(() => [...initialApprovals]);
  const [batch, setBatch] = useState<PendingApproval[]>(() => [...initialApprovals]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [stoppedExchangeId, setStoppedExchangeId] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const batchRef = useRef(batch);
  batchRef.current = batch;
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;
  const answeringRef = useRef(false);
  const liveRunRef = useRef(liveRun);
  liveRunRef.current = liveRun;

  useEffect(() => {
    if (!isReady || restored) return;
    if (agent.messages.length === 0 && initialMessages.length > 0) agent.setMessages([...initialMessages]);
    setRestored(true);
  }, [agent, initialMessages, isReady, restored]);

  useEffect(() => {
    let raised: PendingApproval[] = [];
    let startedAt: number | null = null;
    let answerOnly = false;
    const subscription = agent.subscribe({
      onRunStartedEvent: ({ event }) => {
        raised = [];
        startedAt = runStartedAt(event.runId, liveRunRef.current, Date.now());
        answerOnly = answeringRef.current;
        answeringRef.current = false;
        setBatch([]);
      },
      onRunFinishedEvent: (params) => {
        if (params.outcome !== "interrupt") return;
        const exchangeId = lastQuestionId(agent.messages);
        const position = exchangesOf(agent.messages).at(-1)?.steps.length ?? 0;
        raised = params.interrupts.flatMap((interrupt) => approvalOf(interrupt, exchangeId, position) ?? []);
      },
      onRunFinalized: () => {
        const exchangeId = lastQuestionId(agent.messages);
        if (startedAt !== null && exchangeId) {
          const took = Date.now() - startedAt;
          const answered = answerOnly;
          setDurations((current) => durationsAfter(current, exchangeId, took, answered));
        }
        startedAt = null;
        const fresh = raised;
        raised = [];
        if (fresh.length === 0) return;
        setAsked((current) => [...current.filter((approval) => !fresh.some((entry) => entry.toolCallId === approval.toolCallId)), ...fresh]);
        setBatch(fresh);
      },
      onRunErrorEvent: ({ event }) => setFailure(failureOf(event.message)),
      onRunFailed: ({ error }) => setFailure(failureOf(error)),
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  useEffect(() => {
    if (!restored || !liveRun) return;
    agent.connectAgent({ runId: liveRun.id }).catch((error: unknown) => setFailure(failureOf(error)));
  }, [agent, liveRun, restored]);

  const run = useCallback(
    (resume?: ResumeEntry[]) => {
      setFailure(null);
      setStoppedExchangeId(null);
      copilotkit.runAgent({ agent, ...(resume ? { resume } : {}) }).catch((error: unknown) => {
        answeringRef.current = false;
        setFailure(failureOf(error));
      });
    },
    [agent, copilotkit],
  );

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || agent.isRunning) return;
      const waitingOn = unansweredOf(batchRef.current, decisionsRef.current, agent.pendingInterrupts);
      agent.addMessage({ id: newId(), role: "user", content: question });
      if (waitingOn.length === 0) return run();
      const leftBehind = waitingOn.flatMap((entry) => (entry.toolCallId ? [entry.toolCallId] : []));
      setDecisions({ ...decisionsRef.current, ...Object.fromEntries(leftBehind.map((toolCallId) => [toolCallId, false])) });
      setLeft((current) => new Set([...current, ...leftBehind]));
      setBatch([]);
      run(waitingOn.map(declined));
    },
    [agent, run],
  );

  const runAction = useCallback(
    (action: CardAction) => {
      const request = actionRequest(action);
      if (!request) return;
      send(request.kind === "ask" ? request.prompt : pressedText({ tool: request.tool, input: request.input }));
    },
    [send],
  );

  const decide = useCallback(
    (toolCallId: string, approved: boolean) => {
      const answered = batchRef.current.find((approval) => approval.toolCallId === toolCallId);
      if (!answered || agent.isRunning) return;
      setDecisions({ ...decisionsRef.current, [toolCallId]: approved });
      setBatch([]);
      answeringRef.current = true;
      run([{ interruptId: answered.interruptId, status: "resolved", payload: { approved } }]);
    },
    [agent, run],
  );

  const askAgain = useCallback(() => {
    const kept = askedAgain(agent.messages);
    if (!kept || agent.isRunning) return;
    agent.setMessages(kept);
    run();
  }, [agent, run]);

  const exchanges = exchangesOf(agent.messages);
  const slow = useSlow(agent.isRunning, progressOf(exchanges.at(-1)));
  const waiting = useMemo(() => new Set(batch.filter((approval) => !(approval.toolCallId in decisions)).map((approval) => approval.toolCallId)), [batch, decisions]);

  const stop = useCallback(() => {
    setStoppedExchangeId(exchanges[exchanges.length - 1]?.id ?? null);
    copilotkit.stopAgent({ agent });
  }, [agent, copilotkit, exchanges]);

  const retry = failure?.retryable && !agent.isRunning ? askAgain : null;
  return { ready: isReady && restored, exchanges, running: agent.isRunning, asked, waiting, decisions, left, error: failure?.text ?? null, slow, retry, stoppedExchangeId, durations, send, runAction, decide, stop };
}
