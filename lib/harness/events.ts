import type { ApprovalRule, ContextKind, Evidence, Goal, ObservationStatus, RecoveryAction } from "./types";

export type EventSource = "runtime" | "model" | "gateway" | "ui";

type ToolRef = { toolCallId: string; tool: string };

/** Which bound of a run was reached: its model calls or its tool budget. */
export type RunLimit = "steps" | "tool_calls";

export type ContextRef = { id: string; kind: ContextKind; source: string; scope: string | null; priority: number; chars: number };

/** Everything that can happen in a run, each with the payload that event carries. */
export type HarnessEventBody =
  | { type: "agent.started"; payload: { goal: Goal; userId: string; threadId: string | null } }
  | { type: "context.composed"; payload: { items: ContextRef[]; dropped: string[] } }
  | { type: "context.trimmed"; payload: { droppedMessages: number; keptMessages: number } }
  | { type: "ui.action"; payload: { tool: string } }
  | { type: "approval.granted"; payload: ToolRef }
  | { type: "approval.denied"; payload: ToolRef }
  | { type: "agent.thinking"; payload: { stepId: string; step: number } }
  | { type: "agent.tool.requested"; payload: ToolRef & { stepId: string } }
  | { type: "approval.requested"; payload: ToolRef }
  | { type: "agent.decided"; payload: { stepId: string; finishReason: string; toolCalls: string[] } }
  | { type: "agent.limited"; payload: { limit: RunLimit; step: number } }
  | { type: "ui.rendered"; payload: { stepId: string; components: string[] } }
  | { type: "tool.authorized"; payload: ToolRef & { approval: ApprovalRule } }
  | { type: "tool.denied"; payload: ToolRef & { code: string; reason: string } }
  | { type: "tool.started"; payload: ToolRef & { attempt: number } }
  | { type: "tool.completed"; payload: ToolRef & { attempt: number; latencyMs: number } }
  | { type: "tool.failed"; payload: ToolRef & { attempt: number; code: string; latencyMs: number } }
  | { type: "observation.created"; payload: ToolRef & { observationId: string; status: ObservationStatus; evidence: Evidence } }
  | { type: "verification.passed"; payload: ToolRef & { checks: string[] } }
  | { type: "verification.failed"; payload: ToolRef & { reason: string; retry: boolean } }
  | { type: "recovery.decided"; payload: ToolRef & { action: RecoveryAction; reason: string; fix?: string } }
  | { type: "agent.completed"; payload: { finishReason: string } }
  | { type: "agent.failed"; payload: { reason: string } };

export type HarnessEventType = HarnessEventBody["type"];

export type HarnessEvent = HarnessEventBody & { id: string; runId: string; at: string; source: EventSource };
