import type { RuleRef } from "@/lib/contracts";
import type { ContextRef, HarnessEvent, RunLimit } from "./events";
import type { GuardFinding } from "./guard";
import type { ApprovalRule, Evidence, Goal, ObservationStatus, RecoveryAction } from "./types";

export type ToolVerdict = { passed: true; checks: string[] } | { passed: false; reason: string };

/** One tool call as a person reads it: what the gateway decided, every attempt, what came back, whether it held, and what happened next. */
export type ToolStory = {
  kind: "tool";
  at: string;
  toolCallId: string;
  tool: string;
  approval: ApprovalRule | null;
  denied: { code: string; reason: string; rule: RuleRef | null } | null;
  attempts: number;
  latencyMs: number;
  outcome: { status: ObservationStatus; evidence: Evidence } | null;
  verdict: ToolVerdict | null;
  recovery: { action: RecoveryAction; reason: string; fix: string | null }[];
};

/** One line of a run as the admin reads it, in the order things happened. */
export type TimelineEntry =
  | { kind: "start"; at: string; goal: Goal }
  | { kind: "pressed"; at: string; tool: string }
  | { kind: "answered"; at: string; tool: string; approved: boolean }
  | { kind: "context"; at: string; items: ContextRef[]; dropped: string[] }
  | { kind: "trimmed"; at: string; dropped: number; kept: number }
  | { kind: "step"; at: string; step: number; finishReason: string | null; toolCalls: string[] }
  | ToolStory
  | { kind: "asked"; at: string; tool: string }
  | { kind: "rendered"; at: string; components: string[] }
  | { kind: "composed"; at: string; accepted: number; rejected: number; problems: string[] }
  | { kind: "limited"; at: string; limit: RunLimit; step: number }
  | ({ kind: "guarded"; at: string } & GuardFinding)
  | { kind: "end"; at: string; ok: boolean; reason: string };

function emptyTool(at: string, toolCallId: string, tool: string): ToolStory {
  return { kind: "tool", at, toolCallId, tool, approval: null, denied: null, attempts: 0, latencyMs: 0, outcome: null, verdict: null, recovery: [] };
}

/** Folds a run's events into the lines an admin reads: model steps with what they asked for, and one line per tool call carrying everything the gateway did with it. */
export function timelineOf(events: readonly HarnessEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const tools = new Map<string, ToolStory>();
  const steps = new Map<string, Extract<TimelineEntry, { kind: "step" }>>();
  const toolOf = (at: string, toolCallId: string, tool: string): ToolStory => {
    const known = tools.get(toolCallId);
    if (known) return known;
    const created = emptyTool(at, toolCallId, tool);
    tools.set(toolCallId, created);
    entries.push(created);
    return created;
  };
  for (const event of events) {
    switch (event.type) {
      case "agent.started":
        entries.push({ kind: "start", at: event.at, goal: event.payload.goal });
        break;
      case "ui.action":
        entries.push({ kind: "pressed", at: event.at, tool: event.payload.tool });
        break;
      case "approval.granted":
      case "approval.denied":
        entries.push({ kind: "answered", at: event.at, tool: event.payload.tool, approved: event.type === "approval.granted" });
        break;
      case "context.composed":
        entries.push({ kind: "context", at: event.at, items: event.payload.items, dropped: event.payload.dropped });
        break;
      case "context.trimmed":
        entries.push({ kind: "trimmed", at: event.at, dropped: event.payload.droppedMessages, kept: event.payload.keptMessages });
        break;
      case "agent.thinking": {
        const step = { kind: "step" as const, at: event.at, step: event.payload.step, finishReason: null, toolCalls: [] };
        steps.set(event.payload.stepId, step);
        entries.push(step);
        break;
      }
      case "agent.tool.requested":
        break;
      case "agent.decided": {
        const step = steps.get(event.payload.stepId);
        if (step) Object.assign(step, { finishReason: event.payload.finishReason, toolCalls: event.payload.toolCalls });
        break;
      }
      case "agent.limited":
        entries.push({ kind: "limited", at: event.at, limit: event.payload.limit, step: event.payload.step });
        break;
      case "approval.requested":
        entries.push({ kind: "asked", at: event.at, tool: event.payload.tool });
        break;
      case "ui.rendered":
        entries.push({ kind: "rendered", at: event.at, components: event.payload.components });
        break;
      case "ui.composed":
        entries.push({ kind: "composed", at: event.at, accepted: event.payload.accepted, rejected: event.payload.rejected, problems: event.payload.problems });
        break;
      case "tool.authorized":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).approval = event.payload.approval;
        break;
      case "tool.denied":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).denied = { code: event.payload.code, reason: event.payload.reason, rule: event.payload.rule ?? null };
        break;
      case "tool.started":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).attempts = event.payload.attempt;
        break;
      case "tool.completed":
      case "tool.failed":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).latencyMs += event.payload.latencyMs;
        break;
      case "observation.created":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).outcome = { status: event.payload.status, evidence: event.payload.evidence };
        break;
      case "verification.passed":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).verdict = { passed: true, checks: event.payload.checks };
        break;
      case "verification.failed":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).verdict = { passed: false, reason: event.payload.reason };
        break;
      case "recovery.decided":
        toolOf(event.at, event.payload.toolCallId, event.payload.tool).recovery.push({ action: event.payload.action, reason: event.payload.reason, fix: event.payload.fix ?? null });
        break;
      case "guard.flagged":
        entries.push({ kind: "guarded", at: event.at, ...event.payload });
        break;
      case "agent.completed":
        entries.push({ kind: "end", at: event.at, ok: true, reason: event.payload.finishReason });
        break;
      case "agent.failed":
        entries.push({ kind: "end", at: event.at, ok: false, reason: event.payload.reason });
        break;
    }
  }
  return entries;
}
