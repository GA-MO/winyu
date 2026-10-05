import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { evalCase, type EvalCase } from "./cases";
import { EVAL_CHECKS } from "./checks";
import { turnOf, type RecordedStep, type Recording } from "./recording";

const NORTHEAST = "northeast";

function caseOf(id: string): EvalCase {
  const found = evalCase(id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

function recordingOf(testCase: EvalCase, steps: RecordedStep[]): Recording {
  return {
    version: 1,
    caseId: testCase.id,
    userId: testCase.userId,
    prompt: testCase.prompt,
    model: "test",
    promptHash: "",
    toolsHash: "",
    today: "2026-09-22",
    recordedAt: "2026-09-22T00:00:00.000Z",
    steps,
    asked: [],
    error: null,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: 0 },
    drawn: { cards: [], composed: null },
  };
}

function verdictOf(checkId: string, testCase: EvalCase, steps: RecordedStep[]) {
  const check = EVAL_CHECKS.find((entry) => entry.id === checkId);
  if (!check) throw new Error(`no check ${checkId}`);
  return check.verdict(turnOf(recordingOf(testCase, steps)), testCase);
}

function metricCall(filters: unknown): RecordedStep {
  return { kind: "call", tool: "query_metric", args: { metric: "net_sales_value", dims: [], filters } };
}

function recallCall(questions: string[]): RecordedStep {
  return { kind: "call", tool: "recall_memory", args: { query: "คนลาออก" }, result: { ok: true, summary: "", data: [], conversations: questions.map((question, index) => ({ threadId: `t${index}`, title: question, at: "2026-09-20", question, reply: "", queries: [], score: 0.9 })) } };
}

describe("usedMemory", () => {
  const testCase = caseOf("memory-remember-region");

  test("passes when a metric query filters the remembered region, written as a list or as a plain string", () => {
    expect(verdictOf("usedMemory", testCase, [metricCall({ region: [NORTHEAST] })])?.ok).toBe(true);
    expect(verdictOf("usedMemory", testCase, [metricCall({ region: NORTHEAST })])?.ok).toBe(true);
  });

  test("fails when no query carries the remembered region", () => {
    expect(verdictOf("usedMemory", testCase, [metricCall({})])?.ok).toBe(false);
    expect(verdictOf("usedMemory", testCase, [metricCall({ region: ["south"] })])?.ok).toBe(false);
  });

  test("does not judge a case that expects no filter", () => {
    expect(verdictOf("usedMemory", caseOf("ceo-attainment"), [metricCall({})])).toBeNull();
  });
});

describe("recalledConversation", () => {
  const testCase = caseOf("memory-recall-thread");

  test("passes when recall_memory returned the earlier question", () => {
    expect(verdictOf("recalledConversation", testCase, [recallCall(testCase.before ?? [])])?.ok).toBe(true);
  });

  test("fails when recall found other conversations or was never called", () => {
    expect(verdictOf("recalledConversation", testCase, [recallCall(["สต๊อกดีซีลำพูน"])])?.ok).toBe(false);
    expect(verdictOf("recalledConversation", testCase, [])?.ok).toBe(false);
  });

  test("an earlier question with a number matches its masked form", () => {
    const withNumber: EvalCase = { ...testCase, before: ["ลาออกเกิน 5% ฝ่ายไหน"] };
    expect(verdictOf("recalledConversation", withNumber, [recallCall([`ลาออกเกิน ${TH.memory.maskedNumber}% ฝ่ายไหน`])])?.ok).toBe(true);
  });
});
