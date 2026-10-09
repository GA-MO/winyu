import { toolActionOf, type ToolAction } from "@/lib/cards/tool-action";
import { TH } from "@/lib/i18n/th";
import type { ReplyStep, ToolStep } from "./timeline";

const SUMMARY_SEPARATOR = " · ";
const MS_PER_SECOND = 1000;

/** Where one action of a running or finished answer stands. */
export type TrailState = "running" | "done" | "failed";

/** One tool call of an answer as the trail lists it. */
export type TrailEntry = { id: string; action: ToolAction; state: TrailState };

/** What the agent does while no tool runs: deciding how to answer before its first step, or reading what came back. */
export type TrailPause = "planning" | "reading";

/** The actions of one answer in the order they ran, and the pause the agent is in when nothing runs. */
export type Trail = { entries: TrailEntry[]; pause: TrailPause | null };

function refused(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === false;
}

function stateOf(step: ToolStep, action: ToolAction, streaming: boolean): TrailState {
  if (step.outcome.state === "failed") return "failed";
  if (step.outcome.state === "returned") return refused(step.outcome.result) ? "failed" : "done";
  if (streaming) return "running";
  return action.kind === "write" ? "done" : "failed";
}

function pauseOf(steps: readonly ReplyStep[], entries: readonly TrailEntry[], streaming: boolean): TrailPause | null {
  if (!streaming || entries.some((entry) => entry.state === "running")) return null;
  const last = steps[steps.length - 1];
  if (!last) return "planning";
  return last.kind === "tool" ? "reading" : null;
}

/** The trail of one answer from its reply steps: every tool call named from its arguments with where it stands (calls made together all run at once), and while the answer streams with no call running, whether the agent is planning or reading results; `labels` are the surface's Thai tool labels. */
export function trailOf(steps: readonly ReplyStep[], streaming: boolean, labels: Readonly<Record<string, string>>): Trail {
  const entries = steps.flatMap((step): TrailEntry[] => {
    if (step.kind !== "tool") return [];
    const action = toolActionOf(step.name, step.args, labels);
    return [{ id: step.toolCallId, action, state: stateOf(step, action, streaming) }];
  });
  return { entries, pause: pauseOf(steps, entries, streaming) };
}

/** The one quiet line a finished answer keeps: how many sources it read (or requests it prepared when it read none) and how long it took when that is known; null for an answer that called no tool. */
export function trailSummary(trail: Trail, durationMs: number | null): string | null {
  if (trail.entries.length === 0) return null;
  const reads = trail.entries.filter((entry) => entry.action.kind === "read" && entry.state === "done").length;
  const writes = trail.entries.filter((entry) => entry.action.kind === "write").length;
  const work = reads === 0 && writes > 0 ? TH.trail.requests(writes) : TH.trail.sources(reads);
  const time = durationMs === null ? null : TH.trail.seconds((durationMs / MS_PER_SECOND).toFixed(1));
  return [work, time].filter((part): part is string => part !== null).join(SUMMARY_SEPARATOR);
}
