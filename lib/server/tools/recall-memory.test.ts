import { afterEach, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { MemoryFact } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { forgetConversations, indexTurn } from "@/lib/harness/adapters/mastra/recall";
import { TH } from "@/lib/i18n/th";
import { memoryFacts } from "@/lib/server/agent/collections";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { recallForModel, recallMemoryTool } from "./recall-memory";

const USER = "u_may";
const QUESTION = "อัตราการลาออกแต่ละฝ่ายเป็นยังไง";
const PAST = "t_recall_tool_past";
const NOW = "t_recall_tool_now";
const DAY_MS = 86_400_000;

type Recalled = { summary: string; data: { value: string; status: string }[]; conversations: { threadId: string; question: string; reply: string }[] };
type ForModel = Recalled & { conversationsAre?: string };

function turnOn(threadId: string, turnId = "run_recall_tool"): TurnContext {
  return { turnId, threadId, question: "ครั้งก่อนเรื่องคนลาออก", queries: [] };
}

async function recallOn(threadId: string, query = "ครั้งก่อนที่คุยเรื่องคนลาออก", turnId?: string): Promise<Recalled> {
  const user = findUser(USER);
  if (!user) throw new Error(`missing demo user ${USER}`);
  return runWithAccess(accessFor(user), () => runWithTurn(turnOn(threadId, turnId), () => recallMemoryTool.execute({ query }))) as Promise<Recalled>;
}

function plant(value: string, overrides: Partial<MemoryFact>): MemoryFact {
  return memoryFacts().put({
    id: `recall_fact_${Math.random().toString(36).slice(2, 10)}`,
    userId: USER,
    type: "interest",
    value,
    confidence: 0.45,
    sourceThreadId: PAST,
    createdAt: new Date().toISOString(),
    decayAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
    ...overrides,
  });
}

afterEach(async () => {
  await forgetConversations(USER);
  for (const id of [PAST, NOW]) threads().remove(id);
  for (const fact of memoryFacts().where((item) => item.userId === USER && item.id.startsWith("recall_fact_"))) memoryFacts().remove(fact.id);
});

describe("recall_memory", () => {
  test("returns the person's past conversation in their own words, which the model reads masked and marked as the past, and not the conversation being had", async () => {
    threadForRun(PAST, USER, QUESTION);
    threadForRun(NOW, USER, QUESTION);
    await indexTurn({ userId: USER, threadId: PAST, turnId: "past_1", at: "2026-09-20T03:00:00.000Z", question: `${QUESTION} เกิน 12% ไหม`, reply: "ฝ่ายขายลาออก 12% สูงสุด", queries: [] });
    await indexTurn({ userId: USER, threadId: NOW, turnId: "now_1", at: "2026-09-22T03:00:00.000Z", question: QUESTION, reply: "ฝ่ายผลิตสูงสุด", queries: [] });
    const result = await recallOn(NOW);
    expect(result.conversations.map((found) => found.threadId)).toEqual([PAST]);
    expect(result.conversations[0]?.question).toBe(`${QUESTION} เกิน 12% ไหม`);
    expect(result.summary).toContain("1 บทสนทนา");
    const forModel = recallForModel(result) as ForModel;
    expect(forModel.conversations[0]?.question).toBe(`${QUESTION} เกิน ${TH.memory.maskedNumber}% ไหม`);
    expect(forModel.conversations[0]?.reply).toBe(`ฝ่ายขายลาออก ${TH.memory.maskedNumber}% สูงสุด`);
    expect(JSON.stringify(forModel)).not.toContain("12");
    expect(forModel.conversationsAre).toBe(TH.memory.pastConversations);
  });

  test("hands the model the day a conversation was had in Bangkok, as the card shows it, so a thread from after midnight is not the day before (AI-350)", () => {
    const conversation = { threadId: PAST, title: "ลาออก", at: "2026-10-19T17:37:49.257Z", question: QUESTION, reply: "ฝ่ายขาย", queries: [], score: 0.9 };
    const forModel = recallForModel({ ok: true, summary: "x", data: [], conversations: [conversation] }) as { conversations: { at: string }[] };
    expect(forModel.conversations[0]?.at).toBe("20 ต.ค. 2569");
  });

  test("returns only what Winyu trusts: a fact still being learned or one whose day is over stays out", async () => {
    plant("สนใจอัตราการลาออกของฝ่ายขาย", { confidence: 0.45 });
    plant("สนใจอัตราการลาออกรายฝ่าย", { confidence: 0.75 });
    plant("ดูแลรายงานการลาออกต่อคณะกรรมการ", { type: "responsibility", decayAt: null, confidence: 0.98, until: "2026-01-01" });
    const result = await recallOn(NOW, "การลาออก");
    expect(result.data.map((fact) => fact.value)).toEqual(["สนใจอัตราการลาออกรายฝ่าย"]);
    expect(result.data.every((fact) => fact.status !== "learning")).toBe(true);
  });

  test("tells the model, where it decides to recall, to name the conversation a bare pronoun was taken from or to ask which one, and to call nothing unrelated (AI-346)", () => {
    expect(recallMemoryTool.description()).toMatch(/once per reply/);
    expect(recallMemoryTool.description()).toMatch(/say in one short clause which one you took it from \(its title and date\)/);
    expect(recallMemoryTool.description()).toMatch(/ask which one they mean instead of guessing/);
    expect(recallMemoryTool.description()).toMatch(/Call only the tools that answer the question/);
  });

  test("a second recall in the same turn answers with everything the turn recalled, so the reply draws one card that loses nothing", async () => {
    plant("สนใจอัตราการลาออกรายฝ่าย", { confidence: 0.75 });
    plant("สนใจค่าล่วงเวลาของฝ่ายผลิต", { confidence: 0.75 });
    const turnId = `turn_${Date.now()}`;
    await recallOn(NOW, "การลาออก", turnId);
    const second = await recallOn(NOW, "ค่าล่วงเวลา", turnId);
    expect(second.data.map((fact) => fact.value).sort()).toEqual(["สนใจค่าล่วงเวลาของฝ่ายผลิต", "สนใจอัตราการลาออกรายฝ่าย"]);
    const otherTurn = await recallOn(NOW, "ค่าล่วงเวลา", `${turnId}_next`);
    expect(otherTurn.data.map((fact) => fact.value)).toEqual(["สนใจค่าล่วงเวลาของฝ่ายผลิต"]);
  });
});
