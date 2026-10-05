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

/** A write tool call paused for the person: the interrupt the answer must quote, the call it pauses, and what it would do. */
export type PendingApproval = { interruptId: string; toolCallId: string; tool: string; input: unknown };

/** Everything the chat column draws and can do for one thread. */
export type ChatSession = {
  ready: boolean;
  exchanges: Exchange[];
  running: boolean;
  approvals: PendingApproval[];
  decisions: Readonly<Record<string, boolean>>;
  error: string | null;
  stoppedExchangeId: string | null;
  send: (text: string) => void;
  runAction: (action: CardAction) => void;
  decide: (toolCallId: string, approved: boolean) => void;
  stop: () => void;
};

/** A message as the runtime's agent holds it; the server restores a thread in this shape. */
export type AgentMessage = ReturnType<typeof useAgent>["agent"]["messages"][number];

type MastraInterruptMetadata = { mastra?: { toolName?: unknown; args?: unknown } };

function approvalOf(interrupt: Interrupt): PendingApproval | null {
  if (!interrupt.toolCallId) return null;
  const mastra = (interrupt.metadata as MastraInterruptMetadata | undefined)?.mastra;
  return { interruptId: interrupt.id, toolCallId: interrupt.toolCallId, tool: typeof mastra?.toolName === "string" ? mastra.toolName : "", input: mastra?.args ?? {} };
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
export function useChatSession({ threadId, initialMessages, preloadPacketId }: { threadId: string; initialMessages: readonly AgentMessage[]; preloadPacketId: string | null }): ChatSession {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({ agentId: `${CHAT_AGENT_ID}:${threadId}`, runtimeAgentId: CHAT_AGENT_ID, threadId, updates: UPDATES, throttleMs: THROTTLE_MS });
  const [restored, setRestored] = useState(false);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [stoppedExchangeId, setStoppedExchangeId] = useState<string | null>(null);
  const approvalsRef = useRef(approvals);
  approvalsRef.current = approvals;
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;

  useEffect(() => {
    if (!isReady || restored) return;
    if (agent.messages.length === 0 && initialMessages.length > 0) agent.setMessages([...initialMessages]);
    setRestored(true);
  }, [agent, initialMessages, isReady, restored]);

  useEffect(() => {
    let asked: PendingApproval[] = [];
    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        asked = [];
        setApprovals([]);
      },
      onRunFinishedEvent: (params) => {
        if (params.outcome === "interrupt") asked = params.interrupts.flatMap((interrupt) => approvalOf(interrupt) ?? []);
      },
      onRunFinalized: () => {
        if (asked.length > 0) setApprovals(asked);
        asked = [];
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
      const next = { ...decisionsRef.current, [toolCallId]: approved };
      setDecisions(next);
      const open = approvalsRef.current;
      if (!open.every((approval) => approval.toolCallId in next)) return;
      setApprovals([]);
      run(open.map((approval) => ({ interruptId: approval.interruptId, status: "resolved", payload: { approved: next[approval.toolCallId] } })));
    },
    [run],
  );

  const exchanges = exchangesOf(agent.messages);

  const stop = useCallback(() => {
    setStoppedExchangeId(exchanges[exchanges.length - 1]?.id ?? null);
    copilotkit.stopAgent({ agent });
  }, [agent, copilotkit, exchanges]);

  return { ready: isReady && restored, exchanges, running: agent.isRunning, approvals, decisions, error, stoppedExchangeId, send, runAction, decide, stop };
}
