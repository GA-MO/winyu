import { describe, expect, test } from "bun:test";
import { evalCase, type EvalCase } from "./cases";
import { EVAL_CHECKS } from "./checks";
import { turnOf, type RecordedStep, type Recording } from "./recording";

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

function searched(passages: { doc_id: string; title: string; section: string }[]): RecordedStep {
  return { kind: "call", tool: "search_documents", args: { query: "q" }, result: { ok: true, summary: "", data: { passages: passages.map((passage) => ({ ...passage, version: "1", effective: "1 ก.พ. 2569", owner: "ฝ่ายขาย", text: "" })) } } };
}

function said(text: string): RecordedStep {
  return { kind: "text", text };
}

const CREDIT = { doc_id: "sales-policy", title: "นโยบายการขายและเครดิตเอเย่นต์", section: "ระดับเอเย่นต์และเครดิต › ระยะเวลาเครดิตตามระดับ" };
const SALARY = { doc_id: "hr-compensation-discipline", title: "ค่าตอบแทนและวินัย", section: "โครงสร้างเงินเดือน › กระบอกเงินเดือน" };
const TRAVEL = { doc_id: "employee-handbook", title: "คู่มือพนักงาน", section: "การเดินทาง › เบี้ยเลี้ยง" };

describe("citedDocument", () => {
  const testCase = caseOf("docs-credit-terms");

  test("passes when the expected document came back and the reply names its section or title", () => {
    expect(verdictOf("citedDocument", testCase, [searched([CREDIT]), said("ระดับ B ได้ 30 วัน ตามหมวดระยะเวลาเครดิตตามระดับ")])?.ok).toBe(true);
    expect(verdictOf("citedDocument", testCase, [searched([CREDIT]), said("ตามนโยบายการขายและเครดิตเอเย่นต์ ได้ 30 วัน")])?.ok).toBe(true);
  });

  test("fails when the reply names no source, or the expected document never came back", () => {
    expect(verdictOf("citedDocument", testCase, [searched([CREDIT]), said("ได้ 30 วันครับ")])?.ok).toBe(false);
    expect(verdictOf("citedDocument", testCase, [searched([TRAVEL]), said("ตามคู่มือพนักงาน")])?.ok).toBe(false);
  });
});

describe("saidNotFound", () => {
  const hidden = caseOf("docs-hr-hidden");

  test("passes when the reply says not found and no hidden passage came back", () => {
    expect(verdictOf("saidNotFound", hidden, [searched([TRAVEL]), said("ไม่พบเรื่องนี้ในเอกสารที่คุณเข้าถึงได้")])?.ok).toBe(true);
  });

  test("fails when a passage from the hidden document came back, even if the reply says not found", () => {
    expect(verdictOf("saidNotFound", hidden, [searched([SALARY]), said("ไม่พบในเอกสาร")])?.ok).toBe(false);
  });

  test("fails when the reply answers instead of saying not found", () => {
    expect(verdictOf("saidNotFound", caseOf("docs-unanswerable"), [searched([TRAVEL]), said("พาสัตว์เลี้ยงมาได้วันศุกร์")])?.ok).toBe(false);
  });

  test("does not judge a case that expects a citation", () => {
    expect(verdictOf("saidNotFound", caseOf("docs-credit-terms"), [searched([CREDIT])])).toBeNull();
  });
});
