import { describe, expect, test } from "bun:test";
import { mascopMastra } from "./agent";
import { investigationProgress, startInvestigation, type InvestigationProgress } from "./jobs";

const POLL_MS = 50;
const POLL_LIMIT = 100;
const ENDED: ReadonlySet<string> = new Set(["success", "failed", "canceled", "bailed", "tripwire"]);

async function settled(runId: string): Promise<InvestigationProgress | null> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
    const progress = await investigationProgress(runId);
    if (progress && ENDED.has(progress.status)) return progress;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return investigationProgress(runId);
}

describe("scheduled jobs", () => {
  test("the jobs workflow a schedule fires runs the job it names", async () => {
    const run = await mascopMastra().getWorkflow("mascop-jobs").createRun();
    const result = await run.start({ inputData: { job: "engine" } });
    expect(result.status).toBe("success");
    const output = result.status === "success" ? (result.result as { job: string; result: { alerts: number; forecasts: number } }) : null;
    expect(output?.job).toBe("engine");
    expect(output?.result.forecasts).toBeGreaterThan(0);
  });

  test("an investigation starts in the background, returns its run id at once and reports each person; with no model nobody's stories are replaced", async () => {
    const runId = await startInvestigation(["u_thana", "u_krit"]);
    expect(typeof runId).toBe("string");
    const progress = await settled(runId);
    expect(progress?.status).toBe("success");
    expect(progress?.people).toEqual([
      { userId: "u_thana", done: false, stories: 0 },
      { userId: "u_krit", done: false, stories: 0 },
    ]);
  });

  test("a run id Mastra never started reports nothing", async () => {
    expect(await investigationProgress("no-such-run")).toBeNull();
  });
});
