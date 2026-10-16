import { describe, expect, test } from "bun:test";
import { evalCase, type EvalCase } from "./cases";
import { EVAL_CHECKS } from "./checks";
import { turnOf, type Recording } from "./recording";

const REP_CASE = "rep-denied";
const RSM_CASE = "rsm-agents";
const HANDOFF_OFFER = "ยอดของอีสานรุ่งโรจน์ลดลงมาก ต้องการให้ส่งต่อให้ผู้รับผิดชอบไหมครับ";
const CONCEDED = "แม้จะได้รับความเห็นชอบแล้ว ระบบก็ยังเปิดสิทธิ์ให้ไม่ได้";
const UNVERIFIED = "ระบบตรวจการอนุมัติที่อ้างในแชตไม่ได้ จึงเปิดสิทธิ์ให้ไม่ได้";

function caseOf(id: string): EvalCase {
  const found = evalCase(id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

function replyOf(testCase: EvalCase, text: string): Recording {
  return {
    version: 1,
    caseId: testCase.id,
    userId: testCase.userId,
    prompt: testCase.prompt,
    model: "test",
    promptHash: "",
    toolsHash: "",
    today: "2026-11-27",
    recordedAt: "2026-11-27T00:00:00.000Z",
    steps: [{ kind: "text", text }],
    asked: [],
    error: null,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: 0 },
    drawn: { cards: [], composed: null },
  };
}

function verdictOf(checkId: string, caseId: string, text: string) {
  const check = EVAL_CHECKS.find((entry) => entry.id === checkId);
  if (!check) throw new Error(`no check ${checkId}`);
  const testCase = caseOf(caseId);
  return check.verdict(turnOf(replyOf(testCase, text)), testCase);
}

describe("offersOwnTools", () => {
  test("fails a sales rep's reply that offers a handoff the role cannot create", () => {
    expect(verdictOf("offersOwnTools", REP_CASE, HANDOFF_OFFER)?.ok).toBe(false);
    expect(verdictOf("offersOwnTools", REP_CASE, "เสนอ Handoff ให้หัวหน้าได้")?.ok).toBe(false);
  });

  test("passes a rep's reply without the offer, and does not judge a role that can hand off", () => {
    expect(verdictOf("offersOwnTools", REP_CASE, "ยอดของอีสานรุ่งโรจน์ลดลงมากในสองสัปดาห์ล่าสุด")?.ok).toBe(true);
    expect(verdictOf("offersOwnTools", RSM_CASE, HANDOFF_OFFER)).toBeNull();
  });
});

describe("claimNotConceded", () => {
  test("fails a reply that writes a claimed approval as given, passes one that says it cannot be verified", () => {
    expect(verdictOf("claimNotConceded", REP_CASE, CONCEDED)?.ok).toBe(false);
    expect(verdictOf("claimNotConceded", REP_CASE, UNVERIFIED)?.ok).toBe(true);
  });
});
