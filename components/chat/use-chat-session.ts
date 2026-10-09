"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UseAgentUpdate, useAgent, useCopilotKit, type Interrupt, type ResumeEntry } from "@copilotkit/react-core/v2";
import { actionRequest } from "@/components/cards/action-tool";
import type { CardAction } from "@/components/cards/card-actions";
import { CHAT_AGENT_ID } from "@/components/providers/copilot-provider";
import { TH } from "@/lib/i18n/th";
import { pressedText } from "./pressed";
import { exchangesOf, type Exchange } from "./timeline";

const UPDATES = [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged];
const THROTTLE_MS = 50;
const SIGNED_OUT = /\b401\b/;
const SPENT = /\b409\b/;

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
  error: string | null;
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

function messageOfError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (SIGNED_OUT.test(text)) return TH.conversation.signedOut;
  if (SPENT.test(text)) return TH.harness.approvalSpent;
  return TH.conversation.failed;
}

function newId(): string {
  return crypto.randomUUID();
}

/** One thread's chat over the CopilotKit runtime: restores the saved transcript, sends questions and pressed buttons, answers approval interrupts, and stops a reply. */
export function useChatSession({ threadId, initialMessages, initialApprovals, preloadPacketId }: { threadId: string; initialMessages: readonly AgentMessage[]; initialApprovals: readonly PendingApproval[]; preloadPacketId: string | null }): ChatSession {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({ agentId: `${CHAT_AGENT_ID}:${threadId}`, runtimeAgentId: CHAT_AGENT_ID, threadId, updates: UPDATES, throttleMs: THROTTLE_MS });
  const [restored, setRestored] = useState(false);
  const [asked, setAsked] = useState<PendingApproval[]>(() => [...initialApprovals]);
  const [batch, setBatch] = useState<PendingApproval[]>(() => [...initialApprovals]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [stoppedExchangeId, setStoppedExchangeId] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const batchRef = useRef(batch);
  batchRef.current = batch;
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;

  useEffect(() => {
    if (!isReady || restored) return;
    if (agent.messages.length === 0 && initialMessages.length > 0) agent.setMessages([...initialMessages]);
    setRestored(true);
  }, [agent, initialMessages, isReady, restored]);

  useEffect(() => {
    let raised: PendingApproval[] = [];
    let startedAt: number | null = null;
    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        raised = [];
        startedAt = Date.now();
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
          setDurations((current) => ({ ...current, [exchangeId]: (current[exchangeId] ?? 0) + took }));
        }
        startedAt = null;
        const fresh = raised;
        raised = [];
        if (fresh.length === 0) return;
        setAsked((current) => [...current.filter((approval) => !fresh.some((entry) => entry.toolCallId === approval.toolCallId)), ...fresh]);
        setBatch(fresh);
      },
      onRunErrorEvent: ({ event }) => setError(messageOfError(event.message)),
      onRunFailed: ({ error: failure }) => setError(messageOfError(failure)),
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  const forwardedProps = useMemo(() => (preloadPacketId ? { preloadPacketId } : {}), [preloadPacketId]);

  const run = useCallback(
    (resume?: ResumeEntry[]) => {
      setError(null);
      setStoppedExchangeId(null);
      copilotkit.runAgent({ agent, forwardedProps, ...(resume ? { resume } : {}) }).catch((failure: unknown) => setError(messageOfError(failure)));
    },
    [agent, copilotkit, forwardedProps],
  );

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || agent.isRunning) return;
      agent.addMessage({ id: newId(), role: "user", content: question });
      run();
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
      run([{ interruptId: answered.interruptId, status: "resolved", payload: { approved } }]);
    },
    [agent, run],
  );

  const exchanges = exchangesOf(agent.messages);
  const waiting = useMemo(() => new Set(batch.filter((approval) => !(approval.toolCallId in decisions)).map((approval) => approval.toolCallId)), [batch, decisions]);

  const stop = useCallback(() => {
    setStoppedExchangeId(exchanges[exchanges.length - 1]?.id ?? null);
    copilotkit.stopAgent({ agent });
  }, [agent, copilotkit, exchanges]);

  return { ready: isReady && restored, exchanges, running: agent.isRunning, asked, waiting, decisions, error, stoppedExchangeId, durations, send, runAction, decide, stop };
}
