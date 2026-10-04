import { describe, expect, test } from "bun:test";
import { emitTo, newRun } from "./runtime";
import { timelineOf } from "./timeline";

const GOAL = { id: "g", userMessage: "ยอดขายภาคอีสาน", intent: null, status: "active" as const };
const REF = { toolCallId: "c1", tool: "query_metric" };
const EVIDENCE = { code: null, reason: null, rows: 6, masked: [] };

describe("timelineOf", () => {
  test("a step keeps the tools it asked for, and every event of one tool call folds into one line", () => {
    const run = newRun("u_anucha", "t");
    emitTo(run, "runtime", { type: "agent.started", payload: { goal: GOAL, userId: "u_anucha", threadId: "t" } });
    emitTo(run, "model", { type: "agent.thinking", payload: { stepId: "s1", step: 1 } });
    emitTo(run, "model", { type: "agent.tool.requested", payload: { ...REF, stepId: "s1" } });
    emitTo(run, "model", { type: "agent.decided", payload: { stepId: "s1", finishReason: "tool-calls", toolCalls: ["query_metric"] } });
    emitTo(run, "gateway", { type: "tool.authorized", payload: { ...REF, approval: "never" } });
    emitTo(run, "gateway", { type: "tool.started", payload: { ...REF, attempt: 1 } });
    emitTo(run, "gateway", { type: "tool.failed", payload: { ...REF, attempt: 1, code: "ERROR", latencyMs: 30 } });
    emitTo(run, "gateway", { type: "recovery.decided", payload: { ...REF, action: "retry", reason: "the tool threw" } });
    emitTo(run, "gateway", { type: "tool.started", payload: { ...REF, attempt: 2 } });
    emitTo(run, "gateway", { type: "tool.completed", payload: { ...REF, attempt: 2, latencyMs: 12 } });
    emitTo(run, "gateway", { type: "observation.created", payload: { ...REF, observationId: "o", status: "success", evidence: EVIDENCE } });
    emitTo(run, "gateway", { type: "verification.passed", payload: { ...REF, checks: ["rows_in_scope"] } });
    emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "stop" } });
    const timeline = timelineOf(run.events);
    expect(timeline.map((entry) => entry.kind)).toEqual(["start", "step", "tool", "end"]);
    expect(timeline[1]).toMatchObject({ step: 1, finishReason: "tool-calls", toolCalls: ["query_metric"] });
    expect(timeline[2]).toMatchObject({ tool: "query_metric", approval: "never", attempts: 2, latencyMs: 42, outcome: { status: "success" }, verdict: { passed: true, checks: ["rows_in_scope"] }, recovery: [{ action: "retry" }] });
  });

  test("a refused call is one line with the refusal and no outcome", () => {
    const run = newRun("u_krit", null);
    emitTo(run, "gateway", { type: "tool.denied", payload: { toolCallId: "c2", tool: "create_handoff", code: "TOOL_NOT_ALLOWED", reason: "ไม่มีสิทธิ์" } });
    expect(timelineOf(run.events)).toEqual([expect.objectContaining({ kind: "tool", denied: { code: "TOOL_NOT_ALLOWED", reason: "ไม่มีสิทธิ์" }, outcome: null, attempts: 0 })]);
  });
});
