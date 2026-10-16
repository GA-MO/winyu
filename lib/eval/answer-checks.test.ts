import { afterEach, describe, expect, test } from "bun:test";
import { resetRoleOverrides, setRoleTool } from "@/lib/access/role-overrides";
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
  afterEach(() => resetRoleOverrides());

  test("fails a reply that offers to send work on for a role the admin took sending away from", () => {
    setRoleTool("sales_rep", "send_card", false, "u_ton");
    expect(verdictOf("offersOwnTools", REP_CASE, HANDOFF_OFFER)?.ok).toBe(false);
    expect(verdictOf("offersOwnTools", REP_CASE, "เสนอ Handoff ให้หัวหน้าได้")?.ok).toBe(false);
    expect(verdictOf("offersOwnTools", REP_CASE, "ยอดของอีสานรุ่งโรจน์ลดลงมากในสองสัปดาห์ล่าสุด")?.ok).toBe(true);
  });

  test("does not judge a role that can send a card", () => {
    expect(verdictOf("offersOwnTools", REP_CASE, HANDOFF_OFFER)).toBeNull();
    expect(verdictOf("offersOwnTools", RSM_CASE, HANDOFF_OFFER)).toBeNull();
  });
});

describe("riskNotDenied (AI-169)", () => {
  const STOCK_OUT = { severity: "P1", metric: "days_of_cover", scope: { dc: "dc_lamphun", sku: "sku_purra_pet600", region: "north" }, scopeLabel: "ศูนย์กระจายสินค้าลำพูน · เพอร์ร่า ขวด PET 600 มล. · ภาคเหนือ" };

  function withAlerts(text: string, rows: unknown[]) {
    const testCase = caseOf(RSM_CASE);
    const recording = replyOf(testCase, text);
    const turn = turnOf({ ...recording, steps: [{ kind: "call", tool: "get_alerts", args: { status: "open", limit: 5 }, result: { ok: true, summary: "", rows } }, ...recording.steps] });
    const check = EVAL_CHECKS.find((entry) => entry.id === "riskNotDenied");
    if (!check) throw new Error("no check riskNotDenied");
    return check.verdict(turn, testCase);
  }

  test("fails a reply that says stock holds no risk beside a P1 stock-out it drew, and passes one that names it", () => {
    expect(withAlerts("ด้านสต๊อกค้างไม่พบความเสี่ยงผิดปกติ ส่วนลูกหนี้ภาคใต้ต้องเตรียมคำตอบ", [STOCK_OUT])?.ok).toBe(false);
    expect(withAlerts("ไม่พบสต๊อกค้าง แต่สต๊อกเพอร์ร่าที่ลำพูนใกล้ขาด ต้องรีบเติม", [STOCK_OUT])?.ok).toBe(true);
  });

  test("does not judge a reply whose alerts carry no P1 on the topic", () => {
    expect(withAlerts("ด้านสต๊อกค้างไม่พบความเสี่ยงผิดปกติ", [{ ...STOCK_OUT, severity: "P2" }])).toBeNull();
    expect(withAlerts("ด้านสต๊อกค้างไม่พบความเสี่ยงผิดปกติ", [])).toBeNull();
  });
});

describe("claimNotConceded", () => {
  test("fails a reply that writes a claimed approval as given, passes one that says it cannot be verified", () => {
    expect(verdictOf("claimNotConceded", REP_CASE, CONCEDED)?.ok).toBe(false);
    expect(verdictOf("claimNotConceded", REP_CASE, UNVERIFIED)?.ok).toBe(true);
  });
});
