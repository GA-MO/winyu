import type { HarnessEvent } from "./events";
import type { Goal } from "./types";

export type Phase = "composing" | "thinking" | "acting" | "awaiting_approval" | "completed" | "failed";

export type ToolCallStatus = "requested" | "awaiting_approval" | "authorized" | "denied" | "running" | "succeeded" | "failed" | "withheld";

export type ToolCallState = { toolCallId: string; tool: string; status: ToolCallStatus; attempts: number; observationId: string | null; verified: boolean | null };

/** Where a run stands, folded from its events: the execution state, kept apart from the conversation. */
export type AgentState = {
  runId: string;
  goal: Goal | null;
  phase: Phase;
  step: number;
  activeTool: string | null;
  pendingApprovals: string[];
  toolCalls: Record<string, ToolCallState>;
  observations: string[];
  uiState: { actions: string[]; components: string[] };
  contextRefs: string[];
  errors: string[];
};

export function initialState(runId: string): AgentState {
  return { runId, goal: null, phase: "composing", step: 0, activeTool: null, pendingApprovals: [], toolCalls: {}, observations: [], uiState: { actions: [], components: [] }, contextRefs: [], errors: [] };
}

function withCall(state: AgentState, toolCallId: string, tool: string, change: Partial<ToolCallState>): AgentState {
  const current = state.toolCalls[toolCallId] ?? { toolCallId, tool, status: "requested", attempts: 0, observationId: null, verified: null };
  return { ...state, toolCalls: { ...state.toolCalls, [toolCallId]: { ...current, ...change } } };
}

function without(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}

/** The state after one more event; pure, so a saved trace replays to the same state. */
export function reduce(state: AgentState, event: HarnessEvent): AgentState {
  switch (event.type) {
    case "agent.started":
      return { ...state, goal: event.payload.goal, phase: "composing" };
    case "context.composed":
      return { ...state, contextRefs: event.payload.items.map((item) => item.id) };
    case "context.trimmed":
      return state;
    case "ui.action":
      return { ...state, uiState: { ...state.uiState, actions: [...state.uiState.actions, event.payload.tool] } };
    case "approval.granted":
      return withCall({ ...state, pendingApprovals: without(state.pendingApprovals, event.payload.toolCallId) }, event.payload.toolCallId, event.payload.tool, { status: "authorized" });
    case "approval.denied":
      return withCall({ ...state, pendingApprovals: without(state.pendingApprovals, event.payload.toolCallId) }, event.payload.toolCallId, event.payload.tool, { status: "denied" });
    case "agent.thinking":
      return { ...state, phase: "thinking", step: event.payload.step };
    case "agent.tool.requested":
      return withCall(state, event.payload.toolCallId, event.payload.tool, {});
    case "approval.requested":
      return withCall({ ...state, pendingApprovals: [...state.pendingApprovals, event.payload.toolCallId] }, event.payload.toolCallId, event.payload.tool, { status: "awaiting_approval" });
    case "agent.decided":
    case "agent.limited":
      return state;
    case "ui.rendered":
      return { ...state, uiState: { ...state.uiState, components: [...state.uiState.components, ...event.payload.components] } };
    case "tool.authorized":
      return withCall(state, event.payload.toolCallId, event.payload.tool, { status: "authorized" });
    case "tool.denied":
      return withCall({ ...state, errors: [...state.errors, event.payload.code] }, event.payload.toolCallId, event.payload.tool, { status: "denied" });
    case "tool.started":
      return withCall({ ...state, phase: "acting", activeTool: event.payload.tool }, event.payload.toolCallId, event.payload.tool, { status: "running", attempts: event.payload.attempt });
    case "tool.completed":
      return withCall({ ...state, activeTool: null }, event.payload.toolCallId, event.payload.tool, { status: "succeeded" });
    case "tool.failed":
      return withCall({ ...state, activeTool: null, errors: [...state.errors, event.payload.code] }, event.payload.toolCallId, event.payload.tool, { status: "failed" });
    case "observation.created":
      return withCall({ ...state, observations: [...state.observations, event.payload.observationId] }, event.payload.toolCallId, event.payload.tool, { observationId: event.payload.observationId });
    case "verification.passed":
      return withCall(state, event.payload.toolCallId, event.payload.tool, { verified: true });
    case "verification.failed":
      return withCall({ ...state, errors: [...state.errors, event.payload.reason] }, event.payload.toolCallId, event.payload.tool, { verified: false });
    case "recovery.decided":
      return event.payload.action === "withhold" ? withCall(state, event.payload.toolCallId, event.payload.tool, { status: "withheld" }) : state;
    case "agent.completed":
      return completed(state);
    case "agent.failed":
      return { ...state, phase: "failed", activeTool: null, errors: [...state.errors, event.payload.reason], goal: state.goal && { ...state.goal, status: "failed" } };
  }
}

function completed(state: AgentState): AgentState {
  if (state.pendingApprovals.length > 0) return { ...state, phase: "awaiting_approval", activeTool: null };
  return { ...state, phase: "completed", activeTool: null, goal: state.goal && { ...state.goal, status: "completed" } };
}

export function stateOf(runId: string, events: readonly HarnessEvent[]): AgentState {
  return events.reduce(reduce, initialState(runId));
}
