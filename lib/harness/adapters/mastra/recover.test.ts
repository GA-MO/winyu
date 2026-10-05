import { describe, expect, test } from "bun:test";
import { checkpointRun, emitTo, inflightRuns, newRun, runStore } from "@/lib/harness/runtime";
import { recoverChatRuns } from "./recover";

describe("recoverChatRuns", () => {
  test("a run the last process left mid-reply without a Mastra checkpoint is closed in its trace as interrupted, not left in flight", async () => {
    const run = newRun("u_thana", "t-restart", { id: "run-orphan", initiator: "person" });
    emitTo(run, "runtime", { type: "agent.started", payload: { goal: { id: "t-restart:m-1", userMessage: "ยอดขายเดือนนี้", intent: null, status: "active" }, userId: "u_thana", threadId: "t-restart" } });
    checkpointRun(run);
    expect(await recoverChatRuns()).toContainEqual({ runId: "run-orphan", outcome: "closed" });
    const saved = runStore().get("run-orphan");
    expect(saved?.events.map((event) => event.type)).toEqual(["agent.started", "agent.failed"]);
    expect(inflightRuns().get("run-orphan")).toBeNull();
  });

  test("a second boot finds nothing left to recover", async () => {
    await recoverChatRuns();
    expect(await recoverChatRuns()).toEqual([]);
  });
});
