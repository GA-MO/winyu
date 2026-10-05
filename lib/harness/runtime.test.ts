import { describe, expect, test } from "bun:test";
import { checkpointRun, emitTo, inflightRuns, newRun, refreshCheckpoint, resumedRun, runStore, saveRun } from "./runtime";

const TOOL = { toolCallId: "c1", tool: "query_metric" };

describe("run checkpoints", () => {
  test("a run cut off mid-reply comes back with its trace and the steps and tool calls it already spent", () => {
    const run = newRun("u_thana", "t-1", { id: "run-cut", initiator: "teams" });
    emitTo(run, "model", { type: "agent.thinking", payload: { stepId: "run-cut:1", step: 1 } });
    emitTo(run, "gateway", { type: "tool.authorized", payload: { ...TOOL, approval: "never" } });
    emitTo(run, "gateway", { type: "tool.denied", payload: { toolCallId: "c2", tool: "query_metric", code: "scope", reason: "out of scope" } });
    checkpointRun(run);
    emitTo(run, "model", { type: "agent.thinking", payload: { stepId: "run-cut:2", step: 2 } });
    refreshCheckpoint(run);
    const stored = inflightRuns().get("run-cut");
    if (!stored) throw new Error("no checkpoint");
    const resumed = resumedRun(stored);
    expect(resumed.events.map((event) => event.type)).toEqual(["agent.thinking", "tool.authorized", "tool.denied", "agent.thinking"]);
    expect({ toolCalls: resumed.toolCalls, steps: resumed.steps, threadId: resumed.threadId, initiator: resumed.initiator }).toEqual({ toolCalls: 2, steps: 2, threadId: "t-1", initiator: "teams" });
    saveRun(resumed);
  });

  test("a run that was never checkpointed is not written by a step refresh, and saving a run clears its checkpoint", () => {
    const job = newRun("u_thana", null, { id: "run-job", initiator: "job" });
    refreshCheckpoint(job);
    expect(inflightRuns().get("run-job")).toBeNull();
    const chat = newRun("u_thana", "t-2", { id: "run-chat", initiator: "person" });
    checkpointRun(chat);
    saveRun(chat);
    expect(inflightRuns().get("run-chat")).toBeNull();
    expect(runStore().get("run-chat")?.threadId).toBe("t-2");
  });
});
