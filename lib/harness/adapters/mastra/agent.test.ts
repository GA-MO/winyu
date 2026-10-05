import { describe, expect, test } from "bun:test";
import { newRun, runWithRun } from "@/lib/harness/runtime";
import { LIMITS } from "@/lib/harness/limits";
import { TH } from "@/lib/i18n/th";
import { wrapUpAtLimit } from "./agent";

type StepArgs = Parameters<typeof wrapUpAtLimit>[0];

const SYSTEM = [{ role: "system" as const, content: "persona" }];

function step(stepNumber: number): StepArgs {
  return { stepNumber, systemMessages: SYSTEM } as unknown as StepArgs;
}

describe("wrapUpAtLimit", () => {
  test("leaves every step before the last alone", () => {
    const run = newRun("u_thana", null, { initiator: "person" });
    expect(runWithRun(run, () => wrapUpAtLimit(step(LIMITS.maxSteps - 2)))).toBeUndefined();
    expect(run.events).toEqual([]);
  });

  test("the last step a run may take gets no tools and the wrap-up instruction", () => {
    const run = newRun("u_thana", null, { initiator: "person" });
    const prepared = runWithRun(run, () => wrapUpAtLimit(step(LIMITS.maxSteps - 1)));
    expect(prepared).toEqual({ toolChoice: "none", systemMessages: [...SYSTEM, { role: "system", content: TH.harness.wrapUp }] });
    expect(run.events.map((event) => event.type === "agent.limited" && event.payload)).toEqual([{ limit: "steps", step: LIMITS.maxSteps }]);
  });

  test("a spent tool budget wraps up early", () => {
    const run = newRun("u_thana", null, { initiator: "person", toolBudget: 2 });
    run.toolCalls = 2;
    const prepared = runWithRun(run, () => wrapUpAtLimit(step(1)));
    expect(prepared).toMatchObject({ toolChoice: "none" });
    expect(run.events.map((event) => event.type === "agent.limited" && event.payload.limit)).toEqual(["tool_calls"]);
  });
});
