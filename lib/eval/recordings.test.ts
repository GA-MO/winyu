import { describe, expect, test } from "bun:test";
import { scoreTurn } from "@/lib/harness/adapters/mastra/scorers";
import { readKnownFailures, unexpectedFailures } from "./baseline";
import { EVAL_CASES, evalCase } from "./cases";
import { EVAL_CHECKS } from "./checks";
import { readRecordings, turnOf, type EvalTurn, type Recording } from "./recording";

const recordings = readRecordings();
const known = readKnownFailures();

function recordingOf(caseId: string): Recording {
  const recording = recordings.get(caseId);
  if (!recording) throw new Error(`no recording for ${caseId}`);
  return recording;
}

function verdictOf(checkId: string, turn: EvalTurn, caseId: string) {
  const check = EVAL_CHECKS.find((entry) => entry.id === checkId);
  const testCase = evalCase(caseId);
  if (!check || !testCase) throw new Error(`no check ${checkId} or case ${caseId}`);
  return check.verdict(turn, testCase);
}

describe("recorded evals", () => {
  test("every case has a committed recording", () => {
    expect(EVAL_CASES.filter((testCase) => !recordings.has(testCase.id)).map((testCase) => testCase.id)).toEqual([]);
  });

  test("every recording scores with no failure outside evals/known-failures.json", async () => {
    const unexpected: string[] = [];
    for (const testCase of EVAL_CASES) {
      const recording = recordings.get(testCase.id);
      if (!recording) continue;
      const failed = (await scoreTurn(turnOf(recording), testCase)).filter((score) => !score.ok);
      const fresh = unexpectedFailures(testCase.id, failed.map((score) => score.id), known);
      unexpected.push(...failed.filter((score) => fresh.includes(score.id)).map((score) => `${testCase.id} ${score.id}: ${score.detail}`));
    }
    expect(unexpected).toEqual([]);
  });

  test("a card block line that types a number is dropped from the recorded reply and the block is marked", () => {
    const recording = recordingOf("people-team");
    const typed = recording.steps.map((step) => (step.kind === "text" ? { ...step, text: step.text.replace('"title":{"path":"title"}', '"title":"ตำแหน่งว่าง 2 ตำแหน่ง"') } : step));
    expect(typed).not.toEqual(recording.steps);
    const turn = turnOf({ ...recording, steps: typed });
    expect(verdictOf("blockHeld", turn, "people-team")?.ok).toBe(false);
    expect(verdictOf("blockHeld", turnOf(recording), "people-team")?.ok).toBe(true);
  });

  test("a composed card that carries a typed number fails grounding even if the composer let it through", () => {
    const turn = turnOf(recordingOf("people-team"));
    const leaked = { ...turn, composed: turn.composed && { ...turn.composed, components: [{ ...turn.composed.components[0], title: "ทีมขาย 5 คน" }, ...turn.composed.components.slice(1)] } };
    expect(verdictOf("groundedCard", turn, "people-team")?.ok).toBe(true);
    expect(verdictOf("groundedCard", leaked, "people-team")?.ok).toBe(false);
  });

  test("a sales rep's recorded reads stay in the rep's region, and a row from another region is caught", () => {
    const turn = turnOf(recordingOf("people-rep-scope"));
    expect(verdictOf("inScope", turn, "people-rep-scope")?.ok).toBe(true);
    const leaked: EvalTurn = { ...turn, calls: [...turn.calls, { kind: "call", tool: "find_people", args: {}, result: { ok: true, data: [{ name: "x", region: "south" }] } }] };
    expect(verdictOf("inScope", leaked, "people-rep-scope")).toEqual({ ok: false, detail: "เห็นภาคนอกขอบเขต: south" });
  });
});
